# Solidity API

## CollateralSpenderManager

This contract handles the collateral spender for OverlayerWrap

### CollateralSpenderManagerInvalidSpenderAddress

```solidity
error CollateralSpenderManagerInvalidSpenderAddress()
```

Error thrown when spender address is invalid (zero address)

### CollateralSpenderManagerIntervalNotRespected

```solidity
error CollateralSpenderManagerIntervalNotRespected()
```

Error thrown when proposal time interval is not respected

### CollateralSpenderManagerOperatioNotAllowed

```solidity
error CollateralSpenderManagerOperatioNotAllowed()
```

Error thrown when operation is not allowed for the caller

### ProposedCollateralSpender

```solidity
event ProposedCollateralSpender(address, uint256)
```

Emitted when a new collateral spender is proposed

### AcceptedProposedCollateralSpender

```solidity
event AcceptedProposedCollateralSpender(uint256)
```

Emitted when a new collateral spender has accepted the proposal

### COLLATERAL_MANAGER_ROLE

```solidity
bytes32 COLLATERAL_MANAGER_ROLE
```

role enabling to transfer collateral to custody wallets

### PROPOSAL_TIME_INTERVAL

```solidity
uint256 PROPOSAL_TIME_INTERVAL
```

@notice The time interval needed to changed a spender address

### approvedCollateralSpender

```solidity
address approvedCollateralSpender
```

@notice The unique approved collateral spender

### proposedSpender

```solidity
address proposedSpender
```

@notice The proposed new spender

### proposalTime

```solidity
uint256 proposalTime
```

@notice The last proposal time

### constructor

```solidity
constructor() internal
```

### _initalize

```solidity
function _initalize(address admin_, struct OverlayerWrapCoreTypes.StableCoin collateral_, struct OverlayerWrapCoreTypes.StableCoin aCollateral_) internal
```

Initializes the contract with admin and collateral configurations

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin_ | address | Address of the contract administrator |
| collateral_ | struct OverlayerWrapCoreTypes.StableCoin | Configuration for the main collateral token |
| aCollateral_ | struct OverlayerWrapCoreTypes.StableCoin | Configuration for the associated collateral token |

### getSpender

```solidity
function getSpender() public view returns (address)
```

@notice View the spender

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The active spender |

### proposeNewCollateralSpender

```solidity
function proposeNewCollateralSpender(address spender_) external
```

@notice Propose a new spender

_Can not be zero address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| spender_ | address | The proposed new spender |

### acceptProposedCollateralSpender

```solidity
function acceptProposedCollateralSpender() external
```

@notice The proposed spender accepts to be the spender

_If it is the initial spender, the PROPOSAL_TIME_INTERVAL is not respected_

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

## OverlayerWrapCore

This contract mints and redeems the OverlayerWrap contract that inherits this contract

### mintedPerBlock

```solidity
mapping(uint256 => uint256) mintedPerBlock
```

OverlayerWrap minted per block

### redeemedPerBlock

```solidity
mapping(uint256 => uint256) redeemedPerBlock
```

OverlayerWrap redeemed per block

### maxRedeemWhitelist

```solidity
mapping(address => bool) maxRedeemWhitelist
```

Whitelist users from max redeem / block

### maxMintPerBlock

```solidity
uint256 maxMintPerBlock
```

Max minted OverlayerWrap allowed per block

### maxRedeemPerBlock

```solidity
uint256 maxRedeemPerBlock
```

@notice Max redeemed OverlayerWrap allowed per block

### minValmaxRedeemPerBlock

```solidity
uint256 minValmaxRedeemPerBlock
```

@notice Max redeemed OverlayerWrap allowed per block minimum value

### proposedRedeemChangeTime

```solidity
uint256 proposedRedeemChangeTime
```

Timestamp at which a change was proposed

### proposedMaxRedeemPerBlock

```solidity
uint256 proposedMaxRedeemPerBlock
```

Value proposed for maxRedeemPerBlock

### hubChainId

```solidity
uint256 hubChainId
```

Hub chain id

### belowMaxMintPerBlock

```solidity
modifier belowMaxMintPerBlock(uint256 mintAmount_)
```

Ensure that the already minted OverlayerWrap in the actual block plus the amount to be minted is below the maxMintPerBlock

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| mintAmount_ | uint256 | The OverlayerWrap amount to be minted |

### belowMaxRedeemPerBlock

```solidity
modifier belowMaxRedeemPerBlock(uint256 redeemAmount_)
```

Ensure that the already redeemed OverlayerWrap in the actual block plus the amount to be redeemed is below the maxRedeemPerBlock

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemAmount_ | uint256 | The OverlayerWrap amount to be redeemed |

### onlyHubChain

```solidity
modifier onlyHubChain(uint256 chainId_)
```

Restricts the execution of a function to only be callable by the `hubChain` address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| chainId_ | uint256 | The current chain id |

### constructor

```solidity
constructor(struct IOverlayerWrapDefs.ConstructorParams params_) internal
```

Initializes the OverlayerWrapCore contract with the provided parameters

_Sets up the OFT, ERC20Permit, and Ownable functionality_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| params_ | struct IOverlayerWrapDefs.ConstructorParams | A struct containing initialization parameters. |

### owner

```solidity
function owner() public view returns (address)
```

_We resolve the multiple inheritance of {Ownable} and {SingleAdminAccessControl}
by returning the owner defined in {SingleAdminAccessControl}._

### receive

```solidity
receive() external payable
```

Fallback function to receive ether

### whitelistMaxRedeemPerBlockUser

```solidity
function whitelistMaxRedeemPerBlockUser(address user_, bool status_) external
```

Whitelist or remove a user from the maxRedeemPerBlock exemption list

_Only callable by an account with the DEFAULT_ADMIN_ROLE_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user_ | address | The address of the user to whitelist or remove |
| status_ | bool | True to whitelist the user (exempt from maxRedeemPerBlock), false to remove |

### rescueNative

```solidity
function rescueNative(address to_, uint256 amount_) external
```

Rescue native tokens (ETH) accidentally sent to this contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to_ | address | Recipient address |
| amount_ | uint256 | Amount of native token to transfer |

### approveCollateral

```solidity
function approveCollateral() external
```

Approve an external spender.

_The spender is handled by the CollateralSpenderManager contract
Normally this function is not used as the approval is managed by the acceptance flow_

### setMaxMintPerBlock

```solidity
function setMaxMintPerBlock(uint256 maxMintPerBlock_) external
```

Sets the max mintPerBlock limit

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maxMintPerBlock_ | uint256 | The new max value |

### proposeMaxRedeemPerBlock

```solidity
function proposeMaxRedeemPerBlock(uint256 newMaxRedeemPerBlock_) external
```

Propose a new maxRedeemPerBlock, starts the 15-day delay

### executeMaxRedeemPerBlockChange

```solidity
function executeMaxRedeemPerBlockChange() external
```

Execute the previously proposed change after REDEEM_CHANGE_DELAY days

### disableMint

```solidity
function disableMint() external
```

Disables the mint and redeem

### removeCollateralManagerRole

```solidity
function removeCollateralManagerRole(address collateralManager_) external
```

Removes the collateral manager role from an account, this can ONLY be executed by the gatekeeper role

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| collateralManager_ | address | The address to remove the COLLATERAL_MANAGER_ROLE role from |

### pause

```solidity
function pause() external
```

Pause the contract

_This call is used only to lock the supplyToBacking public call_

### unpause

```solidity
function unpause() external
```

Unpause the contract

### supplyToBacking

```solidity
function supplyToBacking(uint256 amountCollateral_, uint256 amountACollateral_) external
```

Supply funds to the active backing contract (aka approvedCollateralSpender)

_The approveCollateralSpender will collect the funds, as the only entity allowed to do so_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountCollateral_ | uint256 | The amount to supply of collateral |
| amountACollateral_ | uint256 | The amount to supply of aCollateral |

### _initialize

```solidity
function _initialize(struct OverlayerWrapCoreTypes.StableCoin collateral_, struct OverlayerWrapCoreTypes.StableCoin aCollateral_, address admin_, uint256 maxMintPerBlock_, uint256 maxRedeemPerBlock_, uint256 hubChainId_) internal
```

Initialize the contract with base parameters

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| collateral_ | struct OverlayerWrapCoreTypes.StableCoin | Configuration for the main collateral token |
| aCollateral_ | struct OverlayerWrapCoreTypes.StableCoin | Configuration for the associated collateral token |
| admin_ | address | Address of the contract administrator |
| maxMintPerBlock_ | uint256 | Maximum amount that can be minted per block |
| maxRedeemPerBlock_ | uint256 | Maximum amount that can be redeemed per block |
| hubChainId_ | uint256 | The parent chain id |

### _validateInputTokens

```solidity
function _validateInputTokens(struct OverlayerWrapCoreTypes.Order order_) internal view
```

Validate the collateral tokens in an order

_Reverts if the collateral token is not valid
Reverts if the collateral amount is not valid
Given the precision of the collateral and the overlayer wrap, the collateral amount must be scaled to the overlayer wrap amount_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order_ | struct OverlayerWrapCoreTypes.Order | Order parameters to validate |

### _managerMint

```solidity
function _managerMint(struct OverlayerWrapCoreTypes.Order order_) internal
```

Internal function to handle minting operations

_Updates minted amount per block and transfers collateral_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order_ | struct OverlayerWrapCoreTypes.Order | Order details containing mint parameters |

### _managerRedeem

```solidity
function _managerRedeem(struct OverlayerWrapCoreTypes.Order order_) internal returns (uint256 amountToBurn, uint256 back)
```

Redeem stablecoins for assets

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order_ | struct OverlayerWrapCoreTypes.Order | Struct containing order details |

### _pow10

```solidity
function _pow10(uint256 n) internal pure returns (uint256 r)
```

### _withdrawFromProtocol

```solidity
function _withdrawFromProtocol(uint256 amount_, address wantCollateral_) internal returns (uint256 checkedBurnAmount, uint256 back)
```

Redeem collateral from the protocol

_It will trigger the backing contract (aka approvedCollateralSpender) withdraw method if the collateral is not sufficient
Dust amount will be ignored. Burn amount is rounded to the collateral decimals value_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount_ | uint256 | The amount of OverlayerWrap to burn |
| wantCollateral_ | address | The wanted collateral to withdraw |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| checkedBurnAmount | uint256 | The checked amount to burn |
| back | uint256 | The amount of the underlying or their aToken version returned to user |

### _transferToBeneficiary

```solidity
function _transferToBeneficiary(address beneficiary_, address asset_, uint256 amount_) internal
```

Transfer supported asset to beneficiary address

_This contract needs to have available funds
Asset validation has to be performed by the caller_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| beneficiary_ | address | The redeem beneficiary |
| asset_ | address | The redeemed asset |
| amount_ | uint256 | The redeemed amount |

### _transferCollateral

```solidity
function _transferCollateral(uint256 amount_, address asset_, address recipient_) internal
```

Transfer supported asset to target addresses

_User must have approved this contract for allowance
Asset validation has to be performed by the caller_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount_ | uint256 | The amount to be transfered |
| asset_ | address | The asset to be transfered |
| recipient_ | address | The destination address |

### _setMaxMintPerBlock

```solidity
function _setMaxMintPerBlock(uint256 maxMintPerBlock_) internal
```

Sets the max mintPerBlock limit

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maxMintPerBlock_ | uint256 | The new max value |

### _setMaxRedeemPerBlock

```solidity
function _setMaxRedeemPerBlock(uint256 maxRedeemPerBlock_) internal
```

Sets the max redeemPerBlock limit

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maxRedeemPerBlock_ | uint256 | The new max value |

## OverlayerWrapFactory

### governor

```solidity
address governor
```

### symbolToToken

```solidity
mapping(string => address) symbolToToken
```

### ZeroAddressNotAllowed

```solidity
error ZeroAddressNotAllowed()
```

### OnlyGovernor

```solidity
error OnlyGovernor()
```

### SymbolAlreadyExists

```solidity
error SymbolAlreadyExists(string symbol)
```

### OverlayerWrapDeployed

```solidity
event OverlayerWrapDeployed(address token, string name, string symbol)
```

### constructor

```solidity
constructor(address admin_, address governor_) public
```

### deployInitialOverlayerWrap

```solidity
function deployInitialOverlayerWrap(struct OverlayerWrapCoreTypes.StableCoin collateral_, struct OverlayerWrapCoreTypes.StableCoin aCollateral_, address lzEndpoint_, uint256 maxMintPerBlock_, uint256 maxRedeemPerBlock_, uint256 minValmaxRedeemPerBlock_, uint256 hubChainId_) external returns (address)
```

### deployOverlayerWrap

```solidity
function deployOverlayerWrap(string name_, string symbol_, struct OverlayerWrapCoreTypes.StableCoin collateral_, struct OverlayerWrapCoreTypes.StableCoin aCollateral_, address lzEndpoint_, uint256 maxMintPerBlock_, uint256 maxRedeemPerBlock_, uint256 minValmaxRedeemPerBlock_, uint256 hubChainId_) external returns (address)
```

## IOverlayerWrapBacking

Interface for managing collateral backing for the OverlayerWrap token

### supply

```solidity
function supply(uint256 amount, address collateral) external
```

Supply collateral to the backing contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of collateral to supply |
| collateral | address | The address of the collateral token |

### withdraw

```solidity
function withdraw(uint256 amount, address collateral) external
```

Withdraw collateral from the backing contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of collateral to withdraw |
| collateral | address | The address of the collateral token to withdraw |

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

## IOverlayerWrapEvents

Defines events related to minter role changes

### MinterUpdated

```solidity
event MinterUpdated(address newMinter, address oldMinter)
```

This event is fired when the minter changes

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

## MintableTokenBase

This token represent a mintable token by an allowed minter.

### ZeroAddressException

```solidity
error ZeroAddressException()
```

Error thrown when a zero address is provided

### OnlyMinter

```solidity
error OnlyMinter()
```

Error thrown when caller is not an authorized minter

### CantRenounceOwnership

```solidity
error CantRenounceOwnership()
```

Error thrown when attempting to renounce ownership

### MinterStateChanged

```solidity
event MinterStateChanged(address minter_, bool _event)
```

Event emitted when a minter's status changes

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minter_ | address | Address of the minter |
| _event | bool | New status of the minter (true=added, false=removed) |

### minter

```solidity
mapping(address => bool) minter
```

The allowed minter

### constructor

```solidity
constructor(address admin_, string name_, string symbol_) public
```

The constructor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin_ | address | The contract admin |
| name_ | string | The token name |
| symbol_ | string | The token symbol |

### setMinter

```solidity
function setMinter(address minter_) external
```

Set a new minter

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minter_ | address | The new minter address |

### removeMinter

```solidity
function removeMinter(address minter_) external
```

Set a new minter

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minter_ | address | The new minter address |

### mint

```solidity
function mint(address to_, uint256 amount_) external
```

Mint tokens

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to_ | address | The recipient address |
| amount_ | uint256 | The amount to be minted |

### renounceOwnership

```solidity
function renounceOwnership() public view
```

Renounce contract ownership

_Reverts by design_

## OVA

This token represent the governance OVAG token.

### constructor

```solidity
constructor(address admin_) public
```

The constructor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin_ | address | The contract admin |

## OvaReferral

This token tracks the referral points for OVA airdrop.

### referredFrom

```solidity
mapping(address => address) referredFrom
```

Track the referral source for given address

### referredUsers

```solidity
mapping(address => address[]) referredUsers
```

Track all the referred users for a given address

### generatedPoints

```solidity
mapping(address => uint256) generatedPoints
```

Track all the generated referral points for given address

### allowedPointsTrackers

```solidity
mapping(address => bool) allowedPointsTrackers
```

External entities who can control the points tracking

### referralCodes

```solidity
mapping(string => address) referralCodes
```

Referral code to its creator address

### referralCodesRev

```solidity
mapping(address => string) referralCodesRev
```

Referral code creator address to code

### codes

```solidity
string[] codes
```

All the referral codes

### stakingPools

```solidity
address[] stakingPools
```

All staking pools where this token is emitted from

### Referral

```solidity
event Referral(address source, address consumer)
```

### NewCode

```solidity
event NewCode(string code, address holder)
```

### AddTracker

```solidity
event AddTracker(address tracker)
```

### RemoveTracker

```solidity
event RemoveTracker(address tracker)
```

### StakingPoolSet

```solidity
event StakingPoolSet(address[] pools)
```

### OvaReferralAlreadyReferred

```solidity
error OvaReferralAlreadyReferred()
```

### OvaReferralZeroAddress

```solidity
error OvaReferralZeroAddress()
```

### OvaReferralNotAllowed

```solidity
error OvaReferralNotAllowed()
```

### OvaReferralCodeNotValid

```solidity
error OvaReferralCodeNotValid()
```

### OvaReferralCodeAlreadyUsed

```solidity
error OvaReferralCodeAlreadyUsed()
```

### OvaReferralAlreadyCreatedACode

```solidity
error OvaReferralAlreadyCreatedACode()
```

### OvaReferralStakingPoolsNotSet

```solidity
error OvaReferralStakingPoolsNotSet()
```

### onlyTracker

```solidity
modifier onlyTracker()
```

### constructor

```solidity
constructor(address admin_) public
```

The constructor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin_ | address | The contract admin |

### getStakingPools

```solidity
function getStakingPools() external view returns (address[])
```

### setStakingPools

```solidity
function setStakingPools(address[] pools_) external
```

### consumeReferral

```solidity
function consumeReferral(string code_) external
```

Consume a referral code. This action will harvest all the user positions in the staking pools

_Code holders can not use any code
Staking pools must be set_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code_ | string | The referral code |

### track

```solidity
function track(address source_, uint256 amount_) external
```

Track a new points update

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| source_ | address | The user address to track |
| amount_ | uint256 | The amount of points to be tracked |

### addPointsTracker

```solidity
function addPointsTracker(address tracker_) external
```

Add a new points tracker

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tracker_ | address | The tracker address |

### addCode

```solidity
function addCode(string code_, address holder_) external
```

Add a new referral code

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code_ | string | The tracker address |
| holder_ | address | The code owner |

### addCodeSelf

```solidity
function addCodeSelf(string code_) external
```

Add a new referral code for the caller

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code_ | string | The tracker address |

### removePointsTracker

```solidity
function removePointsTracker(address tracker_) external
```

Remove a points tracker

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tracker_ | address | The tracker address |

### seeReferred

```solidity
function seeReferred(address source_) external view returns (address[])
```

Retrieve all the referred user for a given address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| source_ | address | The query key |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | All the referred user addresses |

### seeReferredByCode

```solidity
function seeReferredByCode(string code_) external view returns (address[])
```

Retrieve all the referred user for a given address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code_ | string | The query key |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | All the referred user addresses |

### codeTotalPoints

```solidity
function codeTotalPoints(string code_) external view returns (uint256)
```

Retrieve all points earned by a given code

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code_ | string | The referral code |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total points |

### allCodes

```solidity
function allCodes() external view returns (string[])
```

Retrieve all the active referral codes

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string[] | The active referral codes |

### totalCodes

```solidity
function totalCodes() external view returns (uint256)
```

Retrieve referral codes count

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The active referral codes count |

## OverlayerWrapSilo

The Silo allows to store OverlayerWrap during the stake cooldown process.

### OverlayerWrapSiloZeroAddressException

```solidity
error OverlayerWrapSiloZeroAddressException()
```

Error thrown when zero address is provided for staking vault or OverlayerWrap

### constructor

```solidity
constructor(address stakingVault_, address overlayerWrap_) public
```

Constructor initializes the silo with staking vault and token addresses

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| stakingVault_ | address | Address of the staking vault contract |
| overlayerWrap_ | address | Address of the OverlayerWrap token contract |

### onlyStakingVault

```solidity
modifier onlyStakingVault()
```

Ensures the caller is the staking vault

### withdraw

```solidity
function withdraw(address to_, uint256 amount_) external
```

Withdraws tokens from the silo to a specified address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to_ | address | Address to_ receive the tokens |
| amount_ | uint256 | amount_ of tokens to_ withdraw |

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

## IOvaReferral

Interface for the OVA referral system that tracks referrals and rewards

### referredFrom

```solidity
function referredFrom(address user) external view returns (address)
```

Get the address that referred a user

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The address of the user to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address that referred the user, or zero address if not referred |

### referralCodes

```solidity
function referralCodes(string code) external view returns (address)
```

Get the address associated with a referral code

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code | string | The referral code to look up |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address that created this referral code |

### seeReferred

```solidity
function seeReferred(address user) external view returns (address[])
```

Get all addresses referred by a user

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The address to check referrals for |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | Array of addresses that were referred by this user |

### generatedPoints

```solidity
function generatedPoints(address user) external view returns (uint256)
```

Get the total points generated by a user through referrals

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The address to check points for |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total number of points generated |

### track

```solidity
function track(address user, uint256 amount) external
```

Track points for a referral action

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The address to track points for |
| amount | uint256 | The amount of points to add |

### consumeReferral

```solidity
function consumeReferral(string code) external
```

Use a referral code to establish a referral relationship

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| code | string | The referral code to consume |

## IOverlayerWrapSiloDefinitions

Defines access control for staking vault operations

### OnlyStakingVault

```solidity
error OnlyStakingVault()
```

Error emitted when the staking vault is not the caller

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

## rOVA

OVA community rewards

_USDT tokens must be sent by the owner to this contract. The owner can add or remove addresses from the whitelist for each reward type._

### Reward

Enumeration to identify reward types.

```solidity
enum Reward {
  usdt,
  rOva
}
```

### InvalidAddress

```solidity
error InvalidAddress()
```

Emitted when an invalid (zero) address is provided.

### NothingToCollect

```solidity
error NothingToCollect()
```

Emitted when a caller attempts to collect rewards but has nothing to claim.

### InvalidInputLength

```solidity
error InvalidInputLength()
```

Emitted when the input lenght does not match.

### USDT

```solidity
address USDT
```

USDT contract address on Ethereum mainnet.

### allowedUsdt

```solidity
mapping(address => uint256) allowedUsdt
```

Mapping that tracks the allowed USDT claim amount for each whitelisted address.

### allowedROva

```solidity
mapping(address => uint256) allowedROva
```

Mapping that tracks the allowed rOVA claim amount for each whitelisted address.

### RewardWhitelisted

```solidity
event RewardWhitelisted(address account, enum rOVA.Reward reward, uint256 amount)
```

Emitted when an address is added to a reward whitelist.

### RewardRemoved

```solidity
event RewardRemoved(address account, enum rOVA.Reward reward)
```

Emitted when an address is removed from a reward whitelist.

### RewardCollected

```solidity
event RewardCollected(address account, enum rOVA.Reward reward, uint256 amount)
```

Emitted when a reward is successfully collected.

### constructor

```solidity
constructor(address admin) public
```

Constructor that sets the initial administrator and initializes the rOVA ERC20 token.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin | address | The address of the contract administrator. |

### recover

```solidity
function recover(address asset) external
```

Allows the owner to recover any ERC20 tokens sent to the contract.

_Transfers the entire balance of the specified token from the contract to the owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset | address | The address of the ERC20 token to recover. |

### add

```solidity
function add(address who, enum rOVA.Reward reward, uint256 amount) external
```

Adds an address to the whitelist for a specified reward.

_Reverts if the provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| who | address | The address to be whitelisted. |
| reward | enum rOVA.Reward | The type of reward to whitelist for (usdt or rOva). |
| amount | uint256 | The reward amount to assign to the address. |

### remove

```solidity
function remove(address who, enum rOVA.Reward reward) external
```

Removes an address from the whitelist for a specified reward.

_Reverts if the provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| who | address | The address to be removed. |
| reward | enum rOVA.Reward | The type of reward to remove from the whitelist (usdt or rOva). |

### batchAdd

```solidity
function batchAdd(address[] accounts, uint256[] amounts, enum rOVA.Reward reward) external
```

Batch adds multiple addresses to the whitelist for a specified reward.

_Reverts if any provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The array of addresses to be whitelisted. |
| amounts | uint256[] | The array of reward amounts to assign to each address. |
| reward | enum rOVA.Reward | The type of reward to whitelist for (usdt or rOva). |

### batchRemove

```solidity
function batchRemove(address[] accounts, enum rOVA.Reward reward) external
```

Batch removes multiple addresses from the whitelist for a specified reward.

_Reverts if any provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The array of addresses to be removed. |
| reward | enum rOVA.Reward | The type of reward to remove from the whitelist (usdt or rOva). |

### collect

```solidity
function collect() external
```

Allows a whitelisted address to collect their assigned rewards.

_Uses nonReentrant to prevent reentrancy attacks. Resets the allowed reward amounts to zero
     before transferring USDT or minting rOVA tokens. Reverts if the caller has no rewards to collect._

## rOVAV2

OVA community rewards

### InvalidAddress

```solidity
error InvalidAddress()
```

Emitted when an invalid (zero) address is provided.

### OperationNotAllowed

```solidity
error OperationNotAllowed()
```

Emitted when trying to perform a not valid operation.

### NothingToCollect

```solidity
error NothingToCollect()
```

Emitted when a caller attempts to collect rewards but has nothing to claim.

### InvalidInputLength

```solidity
error InvalidInputLength()
```

Emitted when the input lenght does not match.

### allowedROva

```solidity
mapping(address => uint256) allowedROva
```

Mapping that tracks the allowed rOVAV2 claim amount for each whitelisted address.

### RewardWhitelisted

```solidity
event RewardWhitelisted(address account, uint256 amount)
```

Emitted when an address is added to a reward whitelist.

### RewardRemoved

```solidity
event RewardRemoved(address account)
```

Emitted when an address is removed from a reward whitelist.

### RewardCollected

```solidity
event RewardCollected(address account, uint256 amount)
```

Emitted when a reward is successfully collected.

### collectionStarted

```solidity
bool collectionStarted
```

Opens the public collection

### constructor

```solidity
constructor(address admin) public
```

Constructor that sets the initial administrator and initializes the rOVAV2 ERC20 token.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin | address | The address of the contract administrator. |

### setCollection

```solidity
function setCollection() external
```

Allows the owner start the token collection.

### recover

```solidity
function recover(address asset) external
```

Allows the owner to recover any ERC20 tokens sent to the contract.

_Transfers the entire balance of the specified token from the contract to the owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset | address | The address of the ERC20 token to recover. |

### add

```solidity
function add(address who, uint256 amount) external
```

Adds an address to the whitelist for a specified reward.

_Reverts if the provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| who | address | The address to be whitelisted. |
| amount | uint256 | The reward amount to assign to the address. |

### remove

```solidity
function remove(address who) external
```

Removes an address from the whitelist for a specified reward.

_Reverts if the provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| who | address | The address to be removed. |

### batchAdd

```solidity
function batchAdd(address[] accounts, uint256[] amounts) external
```

Batch adds multiple addresses to the whitelist for a specified reward.

_Reverts if any provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The array of addresses to be whitelisted. |
| amounts | uint256[] | The array of reward amounts to assign to each address. |

### batchRemove

```solidity
function batchRemove(address[] accounts) external
```

Batch removes multiple addresses from the whitelist for a specified reward.

_Reverts if any provided address is the zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The array of addresses to be removed. |

### collect

```solidity
function collect() external
```

Allows a whitelisted address to collect their assigned rewards.

_Uses nonReentrant to prevent reentrancy attacks. Resets the allowed reward amounts to zero
     before transferring USDT or minting rOVAV2 tokens. Reverts if the caller has no rewards to collect._

### _update

```solidity
function _update(address from, address to, uint256 value) internal
```

_Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
(or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
this function.

Emits a {Transfer} event._

