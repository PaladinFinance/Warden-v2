import json
import os
import web3
import numpy as np
import pytest
import rlp
from hexbytes import HexBytes

# https://github.com/ethereum/go-ethereum/blob/master/core/types/block.go#L69
BLOCK_HEADER = (
    "parentHash",
    "sha3Uncles",
    "miner",
    "stateRoot",
    "transactionsRoot",
    "receiptsRoot",
    "logsBloom",
    "difficulty",
    "number",
    "gasLimit",
    "gasUsed",
    "timestamp",
    "extraData",
    "mixHash",
    "nonce",
    "baseFeePerGas",  # added by EIP-1559 and is ignored in legacy headers
)

HOLDERS = [
    "0x7a16ff8270133f063aab6c9977183d9e72835428",
    "0xf89501b77b2fa6329f94f5a05fe84cebb5c8b1a0",
    "0x9b44473e223f8a3c047ad86f387b80402536b029",
    "0x431e81e5dfb5a24541b5ff8762bdef3f32f96354",
    "0x425d16b0e08a28a3ff9e4404ae99d78c0a076c5a",
    "0x32d03db62e464c9168e41028ffa6e9a05d8c6451",
    "0xb18fbfe3d34fdc227eb4508cde437412b6233121",
    "0x394a16eea604fbd86b0b45184b2d790c83a950e3",
    "0xc72aed14386158960d0e93fecb83642e68482e4b",
    "0x9c5083dd4838e120dbeac44c052179692aa5dac5",
]

BLOCK_NUMBER = 14297900

def block():
    path = os.path.join(os.path.dirname(__file__), f'block.json')
    with open(path) as f:
        return json.load(f)

def proofs(holder):
    path = os.path.join(os.path.dirname(__file__), f"proofs_{holder}.json")
    with open(path) as f:
        return json.load(f)


def serialize_block(block):
    block_header = [
        HexBytes("0x") if isinstance((v := block[k]), int) and v == 0 else HexBytes(v)
        for k in BLOCK_HEADER
        if k in block
    ]
    return rlp.encode(block_header)

def serialize_proofs(proofs):
    account_proof = list(map(rlp.decode, map(HexBytes, proofs["accountProof"])))
    storage_proofs = [
        list(map(rlp.decode, map(HexBytes, proof["proof"]))) for proof in proofs["storageProof"]
    ]
    return rlp.encode([account_proof, *storage_proofs])



# Load json block & proofs et serialize them

block_header_rlp = serialize_block(block())
_block = block()
assert _block["hash"] == web3.Web3.keccak(block_header_rlp).hex(), "Incorrect hash"
path = os.path.join(os.path.dirname(__file__), f"block_header_rlp-{BLOCK_NUMBER}.txt")
with open(path, "w") as f:
        f.write(block_header_rlp.hex())

for h in HOLDERS:
    proof_rlp = serialize_proofs(proofs(h))
    path = os.path.join(os.path.dirname(__file__), f"proof_rlp-{BLOCK_NUMBER}-{h}.txt")
    with open(path, "w") as f:
        f.write(proof_rlp.hex())

