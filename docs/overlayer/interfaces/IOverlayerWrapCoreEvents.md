# Solidity API

## IOverlayerWrapCoreEvents

### Received

```solidity
event Received(address sender, uint256 amount)
```

Event emitted when contract receives ETH

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender | address | The address that sent ETH |
| amount | uint256 | The amount of ETH received |

### OverlayerWrapCoreEmergencyStatus

```solidity
event OverlayerWrapCoreEmergencyStatus(bool status)
```

Event for signaling emergency mode status

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| status | bool | True if emergency mode is active, false otherwise |

### Mint

```solidity
event Mint(address minter, address benefactor, address beneficiary, address collateral, uint256 collateralAmount, uint256 overlayerWrapAmount)
```

Event emitted when OverlayerWrap is minted

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minter | address | The address initiating the mint |
| benefactor | address | The address providing the collateral |
| beneficiary | address | The address receiving the minted tokens |
| collateral | address | The collateral token address |
| collateralAmount | uint256 | The amount of collateral provided |
| overlayerWrapAmount | uint256 | The amount of OverlayerWrap minted |

### Redeem

```solidity
event Redeem(address redeemer, address benefactor, address beneficiary, address collateral, uint256 collateralAmount, uint256 overlayerWrapAmount)
```

Event emitted when funds are redeemed

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemer | address | The address initiating the redemption |
| benefactor | address | The address providing the OverlayerWrap tokens |
| beneficiary | address | The address receiving the collateral |
| collateral | address | The collateral token address |
| collateralAmount | uint256 | The amount of collateral returned |
| overlayerWrapAmount | uint256 | The amount of OverlayerWrap burned |

### MaxMintPerBlockChanged

```solidity
event MaxMintPerBlockChanged(uint256 oldMaxMintPerBlock, uint256 newMaxMintPerBlock)
```

Event emitted when the max mint per block is changed

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| oldMaxMintPerBlock | uint256 | The previous maximum mint amount per block |
| newMaxMintPerBlock | uint256 | The new maximum mint amount per block |

### MaxRedeemPerBlockChanged

```solidity
event MaxRedeemPerBlockChanged(uint256 oldMaxRedeemPerBlock, uint256 newMaxRedeemPerBlock)
```

Event emitted when the max redeem per block is changed

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| oldMaxRedeemPerBlock | uint256 | The previous maximum redeem amount per block |
| newMaxRedeemPerBlock | uint256 | The new maximum redeem amount per block |

### SuppliedToBacking

```solidity
event SuppliedToBacking(address supplier, uint256 amountCollateral, uint256 amountACollateral)
```

Event emitted when collateral has been supplied to the backing contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| supplier | address | The address supplying the collateral |
| amountCollateral | uint256 | The amount of collateral supplied |
| amountACollateral | uint256 | The amount of aToken collateral received |

### ProposedMaxRedeemPerBlock

```solidity
event ProposedMaxRedeemPerBlock(uint256 newValue, uint256 proposedAt)
```

Event emitted when a new maxRedeemPerBlock is proposed

### NativeRescued

```solidity
event NativeRescued(address to, uint256 amount)
```

Emitted when native tokens are rescued from the contract

