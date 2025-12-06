# Solidity API

## StakedOverlayerWrap

Public interface for staking OverlayerWrap tokens with cooldown functionality

_Supports two modes of operation:
     1. Standard ERC4626 mode when cooldown is disabled (duration = 0)
     2. Cooldown mode with custom unstaking process when duration > 0_

### cooldowns

```solidity
mapping(address => struct UserCooldown) cooldowns
```

### SILO

```solidity
contract OverlayerWrapSilo SILO
```

Silo contract for holding tokens during cooldown

### MAX_COOLDOWN_DURATION

```solidity
uint24 MAX_COOLDOWN_DURATION
```

Maximum allowed cooldown duration (90 days)

### cooldownDuration

```solidity
uint24 cooldownDuration
```

Current cooldown duration for unstaking

### withdrawAaveDuringCompound

```solidity
bool withdrawAaveDuringCompound
```

Flag to control Aave withdrawal during compound operations

### ensureCooldownOff

```solidity
modifier ensureCooldownOff()
```

Ensure cooldownDuration is zero

### ensureCooldownOn

```solidity
modifier ensureCooldownOn()
```

Ensure cooldownDuration is gt 0

### constructor

```solidity
constructor(contract IERC20 asset_, address initialRewarder_, address admin_) public
```

Constructor for StakedOverlayerWrap

_Initializes with maximum cooldown duration and Aave withdrawals enabled_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset_ | contract IERC20 | The OverlayerWrap token contract address |
| initialRewarder_ | address | Address authorized to distribute rewards |
| admin_ | address | Contract administrator address |

### mint

```solidity
function mint(uint256 shares_, address receiver_) public virtual returns (uint256)
```

_See {IERC4626-mint}._

### deposit

```solidity
function deposit(uint256 assets_, address receiver_) public virtual returns (uint256)
```

_See {IERC4626-deposit}._

### withdraw

```solidity
function withdraw(uint256 assets_, address receiver_, address owner_) public virtual returns (uint256)
```

_See {IERC4626-withdraw}._

### redeem

```solidity
function redeem(uint256 shares_, address receiver_, address owner_) public virtual returns (uint256)
```

_See {IERC4626-redeem}._

### unstake

```solidity
function unstake(address receiver_) external
```

Claim the staking amount after the cooldown has finished. The address can only retire the full amount of assets.

_Unstake can be called after cooldown have been set to 0, to let accounts to be able to claim remaining assets locked at Silo_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| receiver_ | address | Address to send the assets by the staker |

### cooldownAssets

```solidity
function cooldownAssets(uint256 assets_) external returns (uint256 shares)
```

Redeem assets and starts a cooldown to claim the converted underlying asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| assets_ | uint256 | Assets to redeem |

### cooldownShares

```solidity
function cooldownShares(uint256 shares_) external returns (uint256 assets)
```

Redeem shares into assets and starts a cooldown to claim the converted underlying asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares_ | uint256 | Shares to redeem |

### setCooldownDuration

```solidity
function setCooldownDuration(uint24 duration_) external
```

Set cooldown duration. If cooldown duration is set to zero, the StakedOverlayerWrap behavior changes to follow ERC4626 standard and disables
cooldownShares and cooldownAssets methods. If cooldown duration is greater than zero, the ERC4626 withdrawal and redeem functions are disabled,
breaking the ERC4626 standard, and enabling the cooldownShares and the cooldownAssets functions.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration_ | uint24 | Duration of the cooldown |

### setWithdrawAaveDuringCompound

```solidity
function setWithdrawAaveDuringCompound(bool doWithdraw_) external
```

Controls whether Aave tokens should be withdrawn during compound operations

_Can only be called by contract admin_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| doWithdraw_ | bool | True to enable Aave withdrawals, false to disable |

