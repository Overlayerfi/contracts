# Solidity API

## OverlayerWrap

The stable coin Overlayer

### blacklistActivationTime

```solidity
uint256 blacklistActivationTime
```

The timestamp of the last blacklist activation request

### BLACKLIST_ACTIVATION_TIME

```solidity
uint256 BLACKLIST_ACTIVATION_TIME
```

Time delay for blacklisting to be activated

### notDisabled

```solidity
modifier notDisabled(address account_)
```

Ensure account is not blacklisted

### blacklistAllowed

```solidity
modifier blacklistAllowed()
```

Ensure blacklisting is allowed

### constructor

```solidity
constructor(struct IOverlayerWrapDefs.ConstructorParams params_) public
```

Constructor initializes the OverlayerWrap token

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| params_ | struct IOverlayerWrapDefs.ConstructorParams | A struct containing:        - admin: Address of the contract administrator        - name: Token name        - symbol: Token symbol        - collateral: Configuration for the main collateral token        - aCollateral: Configuration for the associated collateral token        - maxMintPerBlock: Maximum amount that can be minted per block        - maxRedeemPerBlock: Maximum amount that can be redeemed per block |

### mint

```solidity
function mint(struct OverlayerWrapCoreTypes.Order order_) external
```

Mint tokens

_Can be paused by the admin_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order_ | struct OverlayerWrapCoreTypes.Order | A struct containing the mint order |

### setBlackListTime

```solidity
function setBlackListTime(uint256 time_) external
```

Sets the blacklist time.

_Disables blakclist if time is zero._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| time_ | uint256 | The timestamp. |

### redeem

```solidity
function redeem(struct OverlayerWrapCoreTypes.Order order_) external
```

Redeem collateral

_Can not be paused_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order_ | struct OverlayerWrapCoreTypes.Order | A struct containing the mint order |

### disableAccount

```solidity
function disableAccount(address account_) external
```

Disable an account from performing transactions

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account_ | address | The account to be disabled |

### enableAccount

```solidity
function enableAccount(address account_) external
```

Enable an account from performing transactions

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account_ | address | The account to be enabled |

### _update

```solidity
function _update(address from_, address to_, uint256 value_) internal
```

_Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
(or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
this function.

Emits a {Transfer} event._

