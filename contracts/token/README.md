# Note

## `USDO`
This is the standard USDO token which can be minted by an allowed minter. Minting and redeeming are controlled by an external party (see `external_mint_redeem`).

## `USDOM`
Minting and redeeming is controlled by the inherited contract `MintRedeemManager.sol`

## `StakedUSDOFront`
The staked version of `USDO`/`USDOM` based on ERC4626