# Solidity API

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

