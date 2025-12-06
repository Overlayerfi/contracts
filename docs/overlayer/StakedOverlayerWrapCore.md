# Solidity API

## StakedOverlayerWrapCore

Base contract for staking OverlayerWrap tokens with vesting and blacklisting functionality

_This contract is intended to be inherited in order to define custom vesting (cooldowns) policies_

### BLACKLIST_ACTIVATION_TIME

```solidity
uint256 BLACKLIST_ACTIVATION_TIME
```

Time delay for blacklisting to be activated

### REDISTRIBUTION_ACTIVATION_TIME

```solidity
uint256 REDISTRIBUTION_ACTIVATION_TIME
```

Time delay for asset redistribution to be activated

### blacklistActivationTime

```solidity
uint256 blacklistActivationTime
```

The timestamp of the last blacklist activation request

### redistributionActivationTime

```solidity
uint256 redistributionActivationTime
```

The timestamp of the last redistribution activation request

### overlayerWrapBacking

```solidity
address overlayerWrapBacking
```

OverlayerWrap backing contract

### notZero

```solidity
modifier notZero(uint256 amount_)
```

Ensure input amount nonzero

### notOwner

```solidity
modifier notOwner(address target_)
```

Ensures blacklist target is not owner

### blacklistAllowed

```solidity
modifier blacklistAllowed()
```

Ensures blacklist is on

### redistributionAllowed

```solidity
modifier redistributionAllowed()
```

Ensures redistribution is on

### constructor

```solidity
constructor(contract IERC20 asset_, address initialRewarder_, address admin_) internal
```

Constructor for StakedOverlayerWrapCore contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset_ | contract IERC20 | The address of the OverlayerWrap token. |
| initialRewarder_ | address | The address of the initial rewarder. |
| admin_ | address | The address of the admin role. |

### transferInRewards

```solidity
function transferInRewards(uint256 amount_) external
```

Allows the owner to transfer rewards from the controller contract into this contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount_ | uint256 | The amount of rewards to transfer. |

### addToBlacklist

```solidity
function addToBlacklist(address target_, bool isFullBlacklisting_) external
```

Allows the owner (DEFAULT_ADMIN_ROLE) and blacklist managers to blacklist addresses.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| target_ | address | The address to blacklist. |
| isFullBlacklisting_ | bool | Soft or full blacklisting level. |

### removeFromBlacklist

```solidity
function removeFromBlacklist(address target_, bool isFullBlacklisting_) external
```

Allows the owner (DEFAULT_ADMIN_ROLE) and blacklist managers to un-blacklist addresses.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| target_ | address | The address to un-blacklist. |
| isFullBlacklisting_ | bool | Soft or full blacklisting level. |

### setBlackListTime

```solidity
function setBlackListTime(uint256 time_) external
```

Sets the blacklist time.

_Disables blakclist if time is zero._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| time_ | uint256 | The starting timestamp. |

### setRedistributionTime

```solidity
function setRedistributionTime(uint256 time_) external
```

Sets the redistribution time.

_Disables redistribution if time is zero._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| time_ | uint256 | The starting timestamp. |

### setOverlayerWrapBacking

```solidity
function setOverlayerWrapBacking(address backing_) external
```

Sets the overlayerWrap backing contract

_Zero address not disable_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| backing_ | address | The overlayerWrap backing contract |

### receive

```solidity
receive() external payable
```

Fallback function to receive ether

### rescue

```solidity
function rescue(address token_, uint256 amount_, address to_) external
```

Rescue assets accidentally sent to the contract (native or ERC20).

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token_ | address | Address of the token to rescue, or address(0) for native. |
| amount_ | uint256 | Amount to rescue. |
| to_ | address | Recipient address. |

### redistributeLockedAmount

```solidity
function redistributeLockedAmount(address from_, address to_) external
```

_Burns the full restricted user amount and mints to the desired owner address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from_ | address | The address to burn the entire balance, with the WHOLE_RESTRICTED_ROLE |
| to_ | address | The address to mint the entire balance of "from" parameter. |

### totalAssets

```solidity
function totalAssets() public view returns (uint256)
```

_See {IERC4626-totalAssets}._

### decimals

```solidity
function decimals() public pure returns (uint8)
```

_Necessary because both ERC20 (from ERC20Permit) and ERC4626 declare decimals()_

### renounceRole

```solidity
function renounceRole(bytes32, address) public virtual
```

_Remove renounce role access from AccessControl, to prevent users to resign roles._

### _checkMinShares

```solidity
function _checkMinShares() internal view
```

Ensures a small non-zero amount of shares does not remain, exposing to donation attack

### _deposit

```solidity
function _deposit(address caller_, address receiver_, uint256 assets_, uint256 shares_) internal
```

_Deposit/mint common workflow._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| caller_ | address | sender of assets |
| receiver_ | address | where to send shares |
| assets_ | uint256 | assets to deposit |
| shares_ | uint256 | shares to mint |

### _withdraw

```solidity
function _withdraw(address caller_, address receiver_, address sharesOwner_, uint256 assets_, uint256 shares_) internal
```

_Withdraw/redeem common workflow._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| caller_ | address | tx sender |
| receiver_ | address | where to send assets |
| sharesOwner_ | address | where to burn shares from |
| assets_ | uint256 | asset amount to transfer out |
| shares_ | uint256 | shares to burn |

### _update

```solidity
function _update(address from_, address to_, uint256 value_) internal virtual
```

Override of ERC20 transfer logic to handle restricted accounts

_Prevents transfers involving accounts with WHOLE_RESTRICTED_ROLE_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from_ | address | Source address |
| to_ | address | Destination address |
| value_ | uint256 | Amount to transfer |

