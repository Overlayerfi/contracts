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

The time interval needed to changed a spender address

### approvedCollateralSpender

```solidity
address approvedCollateralSpender
```

The unique approved collateral spender

### proposedSpender

```solidity
address proposedSpender
```

The proposed new spender

### proposalTime

```solidity
uint256 proposalTime
```

The last proposal time

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

View the spender

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The active spender |

### proposeNewCollateralSpender

```solidity
function proposeNewCollateralSpender(address spender_) external
```

Propose a new spender

_Can not be zero address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| spender_ | address | The proposed new spender |

### acceptProposedCollateralSpender

```solidity
function acceptProposedCollateralSpender() external
```

The proposed spender accepts to be the spender

_If it is the initial spender, the PROPOSAL_TIME_INTERVAL is not respected_

