# Solidity API

## IStakedOverlayerWrap

Defines core staking functionality and rewards management

### RewardsReceived

```solidity
event RewardsReceived(uint256 amount)
```

Event emitted when the rewards are received

### Received

```solidity
event Received(address sender, uint256 amount)
```

Event emitted when the contract receives ETH

### NativeRescued

```solidity
event NativeRescued(address to, uint256 amount)
```

Event emitted when native tokens are rescued from the contract

### LockedAmountRedistributed

```solidity
event LockedAmountRedistributed(address from, address to, uint256 amount)
```

Event emitted when the balance from an WHOLE_RESTRICTED_ROLE user are redistributed

### StakedOverlayerWrapWithdrawAaveDuringCompoundSet

```solidity
event StakedOverlayerWrapWithdrawAaveDuringCompoundSet(bool enabled)
```

Event emitted when a new value for aave withdraw during compound is set

### BlacklistTimeSet

```solidity
event BlacklistTimeSet(uint256 time)
```

Event emitted when the blacklist timestamp is set

### OverlayerWrapBackingSet

```solidity
event OverlayerWrapBackingSet(address backing)
```

Event emitted when the overlayerWrap backing contract is set

### OvaStakedOverlayerWrapBlackListTimeUpdated

```solidity
event OvaStakedOverlayerWrapBlackListTimeUpdated(uint256 previous, uint256 current)
```

Event emitted when the blacklist timestamp is updated

### OvaStakedOverlayerWrapRedistributionTimeUpdated

```solidity
event OvaStakedOverlayerWrapRedistributionTimeUpdated(uint256 previous, uint256 current)
```

Event emitted when the redistribution timestamp is updated

### StakedOverlayerWrapInvalidAmount

```solidity
error StakedOverlayerWrapInvalidAmount()
```

Error emitted shares or assets equal zero.

### StakedOverlayerWrapInvalidToken

```solidity
error StakedOverlayerWrapInvalidToken()
```

Error emitted when owner attempts to rescue OverlayerWrap tokens.

### StakedOverlayerWrapMinSharesViolation

```solidity
error StakedOverlayerWrapMinSharesViolation()
```

Error emitted when a small non-zero share amount remains, which risks donations attack

### StakedOverlayerWrapOperationNotAllowed

```solidity
error StakedOverlayerWrapOperationNotAllowed()
```

Error emitted when owner is not allowed to perform an operation

### StakedOverlayerWrapStillVesting

```solidity
error StakedOverlayerWrapStillVesting()
```

Error emitted when there is still unvested amount

### StakedOverlayerWrapCantBlacklistOwner

```solidity
error StakedOverlayerWrapCantBlacklistOwner()
```

Error emitted when owner or blacklist manager attempts to blacklist owner

### StakedOverlayerWrapInvalidZeroAddress

```solidity
error StakedOverlayerWrapInvalidZeroAddress()
```

Error emitted when the zero address is given

### StakedOverlayerWrapCannotBlacklist

```solidity
error StakedOverlayerWrapCannotBlacklist()
```

Error emitted when blakclist time is not respected

### StakedOverlayerWrapCannotRedistribute

```solidity
error StakedOverlayerWrapCannotRedistribute()
```

Error emitted when redistribute time is not respected

### StakedOverlayerWrapInvalidTime

```solidity
error StakedOverlayerWrapInvalidTime()
```

Error emitted when blakclist time is not valid

### StakedOverlayerWrapRescueFailed

```solidity
error StakedOverlayerWrapRescueFailed()
```

Error emitted when native asset rescue call fails

### transferInRewards

```solidity
function transferInRewards(uint256 amount) external
```

Transfers rewards to the staking contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Amount of rewards to transfer |

### rescue

```solidity
function rescue(address token, uint256 amount, address to) external
```

Allows rescue of tokens accidentally sent to the contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token to rescue |
| amount | uint256 | Amount of tokens to rescue |
| to | address | Address to receive the rescued tokens |

