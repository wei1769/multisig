import {
  Address,
  beginCell,
  Cell,
  fromNano,
  SendMode,
  toNano,
} from "@ton/core";
let bytes = Buffer.from(
  "b5ee9c720101030100ca000258c75ea50500000000000000000000000000000000000000000000000000000000000000000000000000000002010200c3e9a05b6b52037619e9f57734dce1f1e315673bf62e1936993a96c52edbc6f8b88011637f4ec0f944672098eb6b8d98906100778938c04ed4f249c3177b1365c0f7200000000000000000000000000000000000000000000000000000000000000030006800000000000000000000000000000000000000000000000000000000000000012618026d22c4f6320fcbac34c45cc4a1f0a92f6b",
  "hex"
);

export abstract class Op {
  static readonly multisig = {
    new_order: 0xf718510f,
    execute: 0x75097f5d,
    execute_internal: 0xa32c59bf,
    deposit: 0x0f20e64b,
    crossout: 0xc75ea505,
  };
}

let cell = Cell.fromBoc(bytes)[0];
let body = cell.beginParse();
let opcode = body.loadUint(32);
if (opcode == Op.multisig.deposit) {
  console.log("Deposit");
  console.log("query_id: ", body.loadUintBig(64));
  let ref = body.loadRef().beginParse();
  let jettonWalletAddress = ref.loadUintBig(256).toString(16);

  console.log("from user", ref.loadAddress().toString());
  console.log("jetton wallet", Address.parseRaw("0:" + jettonWalletAddress));
  console.log("jetton amount", ref.loadUintBig(256));
  console.log("event_count", body.loadUintBig(256));
} else if (opcode == Op.multisig.crossout) {
  console.log("Crossout");
  console.log("query_id: ", body.loadUintBig(64));
  let ref = body.loadRef().beginParse();
  let jettonWalletAddress = ref.loadUintBig(256).toString(16).padStart(64, "0");
  console.log("from user", ref.loadAddress().toString());
  console.log("jetton wallet", Address.parseRaw("0:" + jettonWalletAddress));
  console.log("jetton amount", ref.loadUint(256));
  let extra_ref = body.loadRef().beginParse();

  console.log("to_chain_id", extra_ref.loadUintBig(256));
  console.log("to_address", extra_ref);
  console.log("event_count", body.loadUint(256));
}
