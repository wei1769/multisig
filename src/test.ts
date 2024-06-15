import {
  Address,
  beginCell,
  Cell,
  fromNano,
  SendMode,
  toNano,
} from "@ton/core";
let bytes = Buffer.from(
  "b5ee9c720101030100aa0002580f20e64b00000000000000000000000000000000000000000000000000000000000000000000000000000001010200c37422bfa7d3f53eb4161a0b1e8d11d6abfb733295fa58144f7ea1aefb34e93c0f8011637f4ec0f944672098eb6b8d98906100778938c04ed4f249c3177b1365c0f720000000000000000000000000000000000000000000000000000000000000003000282618026d22c4f6320fcbac34c45cc4a1f0a92f6b",
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
  let extra_ref = body.loadRef().beginParse();
  console.log("to_address", extra_ref);
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
