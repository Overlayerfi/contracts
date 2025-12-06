# Solidity API

## UserCooldown

Structure to track user cooldown information

### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

```solidity
struct UserCooldown {
  uint104 cooldownEnd;
  uint152 underlyingAmount;
}
```

## IStakedOverlayerWrapCooldown

Defines the cooldown mechanism for staked tokens

### IStakedOverlayerWrapCooldownDurationUpdated

```solidity
event IStakedOverlayerWrapCooldownDurationUpdated(uint24 previousDuration, uint24 newDuration)
```

Event emitted when cooldown duration updates

### IStakedOverlayerWrapCooldownExcessiveRedeemAmount

```solidity
error IStakedOverlayerWrapCooldownExcessiveRedeemAmount()
```

Error emitted when the shares amount to redeem is greater than the shares balance of the owner

### IStakedOverlayerWrapCooldownExcessiveWithdrawAmount

```solidity
error IStakedOverlayerWrapCooldownExcessiveWithdrawAmount()
```

Error emitted when the shares amount to withdraw is greater than the shares balance of the owner

### IStakedOverlayerWrapCooldownInvalidCooldown

```solidity
error IStakedOverlayerWrapCooldownInvalidCooldown()
```

Error emitted when cooldown value is invalid

### cooldownAssets

```solidity
function cooldownAssets(uint256 assets) external returns (uint256 shares)
```

Initiates cooldown period for a specified amount of assets

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| assets | uint256 | Amount of assets to put in cooldown |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | Amount of shares corresponding to the assets |

### cooldownShares

```solidity
function cooldownShares(uint256 shares) external returns (uint256 assets)
```

Initiates cooldown period for a specified amount of shares

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | Amount of shares to put in cooldown |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| assets | uint256 | Amount of assets corresponding to the shares |

### unstake

```solidity
function unstake(address receiver) external
```

Completes the unstaking process after cooldown period

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| receiver | address | Address to receive the unstaked tokens |

### setCooldownDuration

```solidity
function setCooldownDuration(uint24 duration) external
```

Updates the duration of the cooldown period

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint24 | New cooldown duration in seconds |

