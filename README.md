# contracts

Yield generating USDC/T backed stable coin.

## Overview
![Protocol enter](./obsidia-contract-flow/Slide1.png)
![Protocol exit](./obsidia-contract-flow/Slide2.png)

## Node version required
```
>= 18.x.x
```

## To install
```
npm i
```

## To compile
```
npm run compile
```

## Run tests
```
npm run unit
```
Unit tests must be run on a forked version of Ethereum mainnet (see next point).
Sometimes the private rpc (which the next point is based on) will have issue with `maxFeePerGas` limits. For now running the suite another time should solve the issue.

## Run test node
```
npm run node
```
This will spawn a forked Ethereum mainnet from block `19709557`

## Run script/deployment
```
npm run exec-[network: local/obsidia/eth...] YOUR_SCRIPT
```

## Run `solhint`
```
solhint contracts/**/*.sol
```

## `slither`
Static code analyzer can be installed by following [slither guide](https://github.com/crytic/slither).
From repository root:
```
slither --include-paths contracts/ .
```

Note: Currently `high` and `medium` severities for `Liquidity.sol` are ignored as we plan to deprecate that contract.

## Run `prettier`
```
npm run prettier-ts
npm run prettier-sol
```

## Internal beta RPC
Obsidia has an internal RPC with a copy of Ethereum mainnet starting from block `19709557`
