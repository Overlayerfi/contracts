# Solidity API

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

