# Solidity API

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

