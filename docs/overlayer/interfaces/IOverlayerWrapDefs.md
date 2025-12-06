# Solidity API

## IOverlayerWrapDefs

Defines the core structures and events for the Overlayer Wrap system

### ConstructorParams

Parameters required for constructing the Overlayer Wrap contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

```solidity
struct ConstructorParams {
  address admin;
  address lzEndpoint;
  string name;
  string symbol;
  struct OverlayerWrapCoreTypes.StableCoin collateral;
  struct OverlayerWrapCoreTypes.StableCoin aCollateral;
  uint256 maxMintPerBlock;
  uint256 maxRedeemPerBlock;
  uint256 minValmaxRedeemPerBlock;
  uint256 hubChainId;
}
```

### OverlayerWrapZeroAddressException

```solidity
error OverlayerWrapZeroAddressException()
```

Zero address not allowed

### OverlayerWrapInvalidDecimals

```solidity
error OverlayerWrapInvalidDecimals()
```

The asset decimals can not be larger that the underlying decimals

### OverlayerWrapAccountDisabled

```solidity
error OverlayerWrapAccountDisabled()
```

An account has been disabled from performing transactions

### OverlayerWrapBlacklistNotActive

```solidity
error OverlayerWrapBlacklistNotActive()
```

Blacklist not active

### OverlayerWrapBlacklistTimeNotValid

```solidity
error OverlayerWrapBlacklistTimeNotValid()
```

Blacklist time not valid

### OverlayerWrapInvalidBenefactor

```solidity
error OverlayerWrapInvalidBenefactor()
```

The benefactor of an operation is not the message sender

### DisableAccount

```solidity
event DisableAccount(address account)
```

A blacklist event

### EnableAccount

```solidity
event EnableAccount(address account)
```

A reverted blacklist event

