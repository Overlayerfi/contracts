# Solidity API

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

Max redeemed OverlayerWrap allowed per block

### minValmaxRedeemPerBlock

```solidity
uint256 minValmaxRedeemPerBlock
```

Max redeemed OverlayerWrap allowed per block minimum value

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

