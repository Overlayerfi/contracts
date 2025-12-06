# Solidity API

## OverlayerWrapCoreTypes

Contains type definitions for minting and redeeming operations

### Order

Structure representing a mint/redeem order

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

```solidity
struct Order {
  address benefactor;
  address beneficiary;
  address collateral;
  uint256 collateralAmount;
  uint256 overlayerWrapAmount;
}
```

### StableCoin

Structure representing a stablecoin configuration

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

```solidity
struct StableCoin {
  address addr;
  uint256 decimals;
}
```

