# Solidity API

## OverlayerWrapCollateral

This contract handles the collateral definitions for OverlayerWrap

### CollateralInvalidZeroAddress

```solidity
error CollateralInvalidZeroAddress()
```

### CollateralInvalidDecimals

```solidity
error CollateralInvalidDecimals()
```

### collateral

```solidity
struct OverlayerWrapCoreTypes.StableCoin collateral
```

Supported assets

### aCollateral

```solidity
struct OverlayerWrapCoreTypes.StableCoin aCollateral
```

### _initialize

```solidity
function _initialize(address admin_, struct OverlayerWrapCoreTypes.StableCoin collateral_, struct OverlayerWrapCoreTypes.StableCoin aCollateral_) internal
```

