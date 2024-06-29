# contracts

Yield generating USDC/T backed stable coin.

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
Sometimes the private rpc will (which the next point is based on) has issue with `maxFeePerGas` limits. For now running the suite another time should solve the issue.

## Run test node
```
npm run node
```
This will spawn a forked Ethereum mainnet from block `19709557`

## Run script/deployment
```
npm run exec-[network: local/obsidia/eth...] YOUR_SCRIPT
```

## Internal beta RPC
Obsidia has an internal RPC with a copy of Ethereum mainnet starting from block `19709557`