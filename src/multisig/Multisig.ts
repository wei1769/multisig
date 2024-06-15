import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  MessageRelaxed,
  Sender,
  SendMode,
  Slice,
  storeMessageRelaxed,
} from "@ton/core";
import { Op, Params } from "./Constants";
import { assert } from "../utils/utils";

export type MultisigConfig = {
  threshold: number;
  signers: Array<Address>;
  proposers: Array<Address>;
  supportedTokens: Array<Address>;
  allowArbitrarySeqno: boolean;
};

export type TransferRequest = {
  type: "transfer";
  sendMode: SendMode;
  message: MessageRelaxed;
};
export type UpdateRequest = {
  type: "update";
  threshold: number;
  signers: Array<Address>;
  proposers: Array<Address>;
};

export type UpdateWallet = {
  type: "update_wallet";
  wallet: Array<Address>;
};

export type Action = TransferRequest | UpdateRequest | UpdateWallet;
export type Order = Array<Action>;

function arrayToCell(arr: Array<Address>): Dictionary<number, Address> {
  let dict = Dictionary.empty(
    Dictionary.Keys.Uint(8),
    Dictionary.Values.Address()
  );
  for (let i = 0; i < arr.length; i++) {
    dict.set(i, arr[i]);
  }
  return dict;
}
function arrayToDict(arr: Array<Address>): Dictionary<bigint, number> {
  let dict = Dictionary.empty(
    Dictionary.Keys.BigUint(256),
    Dictionary.Values.Uint(1)
  );
  for (let i = 0; i < arr.length; i++) {
    dict.set(BigInt("0x" + arr[i].hash.toString("hex")), 1);
  }
  return dict;
}

export function dictToArray(addrDict: Cell | null): Array<Address> {
  let resArr: Array<Address> = [];
  if (addrDict !== null) {
    const dict = Dictionary.loadDirect(
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Uint(1),
      addrDict
    );
    dict.keys().forEach((key) => {
      if (key.toString(16).length < 64) {
        console.log(key.toString(16));
      }
      resArr.push(Address.parse("0:" + key.toString(16).padStart(64, "0")));
    });
  }
  return resArr;
}

export function cellToArray(addrDict: Cell | null): Array<Address> {
  const addresses: { [key: string]: boolean } = {};

  let resArr: Array<Address> = [];
  if (addrDict !== null) {
    const dict = Dictionary.loadDirect(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Address(),
      addrDict
    );

    for (let i = 0; i < dict.size; i++) {
      const address = dict.get(i);
      if (!address) throw new Error("invalid dict sequence");
      if (addresses[address.toRawString()])
        throw new Error("duplicate address");
      addresses[address.toRawString()] = true;
    }

    resArr = dict.values();
  }
  return resArr;
}

export function multisigConfigToCell(config: MultisigConfig): Cell {
  return beginCell()
    .storeUint(0, Params.bitsize.orderSeqno)
    .storeUint(config.threshold, Params.bitsize.signerIndex)
    .storeRef(beginCell().storeDictDirect(arrayToCell(config.signers)))
    .storeUint(config.signers.length, Params.bitsize.signerIndex)
    .storeDict(arrayToCell(config.proposers))
    .storeBit(config.allowArbitrarySeqno)
    .storeDict(arrayToDict(config.supportedTokens))
    .endCell();
}

export function endParse(slice: Slice) {
  if (slice.remainingBits > 0 || slice.remainingRefs > 0) {
    throw new Error("remaining bits in data");
  }
}

export function parseMultisigData(data: Cell) {
  const slice = data.beginParse();
  const nextOderSeqno = slice.loadUintBig(256);
  const threshold = slice.loadUint(8);
  const signers = cellToArray(slice.loadRef());
  const signersCount = slice.loadUint(8);
  const proposers = cellToArray(slice.loadMaybeRef());
  const allowArbitraryOrderSeqno = slice.loadBit();
  const supportedTokens = dictToArray(slice.loadMaybeRef());
  // endParse(slice);
  return {
    nextOderSeqno,
    threshold,
    signers,
    signersCount,
    proposers,
    allowArbitraryOrderSeqno,
    supportedTokens,
  };
}

export class Multisig implements Contract {
  public orderSeqno: bigint;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
    readonly configuration?: MultisigConfig
  ) {
    this.orderSeqno = 0n;
  }

  static createFromAddress(address: Address) {
    let multisig = new Multisig(address);
    multisig.orderSeqno = 0n;
    return multisig;
  }

  static createFromConfig(config: MultisigConfig, code: Cell, workchain = 0) {
    const data = multisigConfigToCell(config);
    const init = { code, data };
    return new Multisig(contractAddress(workchain, init), init, config);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0, Params.bitsize.op)
        .storeUint(0, Params.bitsize.queryId)
        .endCell(),
    });
  }

  static packTransferRequest(transfer: TransferRequest) {
    let message = beginCell()
      .store(storeMessageRelaxed(transfer.message))
      .endCell();
    return beginCell()
      .storeUint(Op.actions.send_message, Params.bitsize.op)
      .storeUint(transfer.sendMode, 8)
      .storeRef(message)
      .endCell();
  }

  static packUpdateRequest(update: UpdateRequest) {
    return beginCell()
      .storeUint(Op.actions.update_multisig_params, Params.bitsize.op)
      .storeUint(update.threshold, Params.bitsize.signerIndex)
      .storeRef(beginCell().storeDictDirect(arrayToCell(update.signers)))
      .storeDict(arrayToCell(update.proposers))
      .endCell();
  }
  static packUpdateWallet(update: UpdateWallet) {
    return beginCell()
      .storeUint(Op.actions.update_supported_token, Params.bitsize.op)
      .storeDict(arrayToDict(update.wallet))
      .endCell();
  }

  static packOrder(actions: Array<Action>) {
    let order_dict = Dictionary.empty(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Cell()
    );
    if (actions.length > 255) {
      throw new Error("For action chains above 255, use packLarge method");
    } else {
      // pack transfers to the order_body cell
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionCell =
          action.type === "transfer"
            ? Multisig.packTransferRequest(action)
            : action.type == "update"
            ? Multisig.packUpdateRequest(action)
            : Multisig.packUpdateWallet(action);
        order_dict.set(i, actionCell);
      }
      return beginCell().storeDictDirect(order_dict).endCell();
    }
  }

  static newOrderMessage(
    actions: Cell,
    expirationDate: number,
    isSigner: boolean,
    addrIdx: number,
    order_id: bigint,
    query_id: bigint
  ) {
    const msgBody = beginCell()
      .storeUint(Op.multisig.new_order, Params.bitsize.op)
      .storeUint(query_id, Params.bitsize.queryId)
      .storeUint(order_id, Params.bitsize.orderSeqno)
      .storeBit(isSigner)
      .storeUint(addrIdx, Params.bitsize.signerIndex)
      .storeUint(expirationDate, Params.bitsize.time);

    return msgBody.storeRef(actions).endCell();
  }

  async getOrderAddress(provider: ContractProvider, orderSeqno: bigint) {
    const { stack } = await provider.get("get_order_address", [
      { type: "int", value: orderSeqno },
    ]);
    assert(stack.remaining === 1, "invalid get_order_address result");
    return stack.readAddress();
  }

  async getOrderEstimate(
    provider: ContractProvider,
    order: Order,
    expiration_date: bigint
  ) {
    const orderCell = Multisig.packOrder(order);
    const { stack } = await provider.get("get_order_estimate", [
      { type: "cell", cell: orderCell },
      {
        type: "int",
        value: expiration_date,
      },
    ]);
    assert(stack.remaining === 1, "invalid get_order_estimate result");
    return stack.readBigNumber();
  }

  async getMultisigData(provider: ContractProvider) {
    const { stack } = await provider.get("get_multisig_data", []);

    // let addressCell = beginCell()
    //   .storeAddress(
    //     Address.parse("EQDMopZR4ZJ1cF2l76b5yZ5_isHgTXf3iDzFBLjvyLVUwk8u")
    //   )
    //   .asCell();
    // console.log("addressCell", addressCell.toBoc());
    // console.log(
    //   Address.parse("EQDMopZR4ZJ1cF2l76b5yZ5_isHgTXf3iDzFBLjvyLVUwk8u").toRaw()
    // );

    // const { stack: stack2 } = await provider.get("is_supported_data", [
    //   {
    //     type: "slice",
    //     cell: beginCell()
    //       .storeAddress(
    //         Address.parse("EQDMopZR4ZJ1cF2l76b5yZ5_isHgTXf3iDzFBLjvyLVUwk8u")
    //       )
    //       .asCell(),
    //   },
    // ]);

    // console.log("stack2", stack2);
    assert(stack.remaining >= 4, "invalid get_multisig_data result");
    const nextOrderSeqno = stack.readBigNumber();
    const threshold = stack.readBigNumber();
    const signers = cellToArray(stack.readCellOpt());
    const proposers = cellToArray(stack.readCellOpt());
    let supported = stack.readCell();
    let dict = Dictionary.loadDirect(
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Uint(1),
      supported
    );

    return { nextOrderSeqno, threshold, signers, proposers, dict };
  }
}
