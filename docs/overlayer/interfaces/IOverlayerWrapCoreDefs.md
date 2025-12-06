# Solidity API

## IOverlayerWrapCoreDefs

Defines the error cases for the mint and redeem operations

### OverlayerWrapCoreInvalidZeroAddress

```solidity
error OverlayerWrapCoreInvalidZeroAddress()
```

Thrown when an address parameter that must be non-zero is zero

### OverlayerWrapCoreInvalidDecimals

```solidity
error OverlayerWrapCoreInvalidDecimals()
```

Thrown when token decimals are invalid (e.g., zero)

### OverlayerWrapCoreOverflow

```solidity
error OverlayerWrapCoreOverflow()
```

Thrown when an arithmetic operation overflows

### OverlayerWrapCoreInvalidAssetAmounts

```solidity
error OverlayerWrapCoreInvalidAssetAmounts()
```

Thrown when the provided asset amounts do not match the required parameters

### OverlayerWrapCoreDifferentAssetsAmounts

```solidity
error OverlayerWrapCoreDifferentAssetsAmounts()
```

Thrown when the normalized amounts of different assets are not equal

### OverlayerWrapCoreUnsupportedAsset

```solidity
error OverlayerWrapCoreUnsupportedAsset()
```

Thrown when trying to use an unsupported collateral asset

### OverlayerWrapCoreMaxMintPerBlockExceeded

```solidity
error OverlayerWrapCoreMaxMintPerBlockExceeded()
```

Thrown when trying to mint more tokens than allowed in a single block

### OverlayerWrapCoreMaxRedeemPerBlockExceeded

```solidity
error OverlayerWrapCoreMaxRedeemPerBlockExceeded()
```

Thrown when trying to redeem more tokens than allowed in a single block

### OverlayerWrapCoreSupplyAmountNotReached

```solidity
error OverlayerWrapCoreSupplyAmountNotReached()
```

Thrown when the required supply amount is not reached during an operation

### OverlayerWrapCoreInvalidMaxRedeemAmount

```solidity
error OverlayerWrapCoreInvalidMaxRedeemAmount()
```

Thrown when trying to set an invalid maximum redeem amount (e.g., zero)

### OverlayerWrapCoreInvalidBenefactor

```solidity
error OverlayerWrapCoreInvalidBenefactor()
```

Thrown when the benefactor of an operation is not the message sender

### OverlayerWrapCoreCollateralNotValid

```solidity
error OverlayerWrapCoreCollateralNotValid()
```

Thrown when attempting to use an invalid collateral type or in wrong mode (emergency/normal)

### OverlayerWrapCoreInsufficientFunds

```solidity
error OverlayerWrapCoreInsufficientFunds()
```

Thrown when there are insufficient funds for an operation

### OverlayerWrapCoreNotHubChainId

```solidity
error OverlayerWrapCoreNotHubChainId()
```

Thrown when the chain id is not the hub chain id

### OverlayerWrapCoreDelayNotRespected

```solidity
error OverlayerWrapCoreDelayNotRespected()
```

Thrown when attempted to set a new max redeem per block value before the allowed time

