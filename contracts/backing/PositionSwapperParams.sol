// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

///@param usdc The USDC token address
///@param ausdc The aUSDC token address
///@param usdt The USDT token address
///@param ausdt The aUSDT token address
///@param outToken The out token address
///@param aavePool The Aave Pool.sol contract address
///@param router The swap router address
///@param quoter The swap router quoter address
///@param amountUsdc The amount to withdraw intended as USDC
///@param amountUsdt The amount to withdraw intended as USDCT
///@param beneficiary The receiver of aWETH tokens
///@param aaveRefCode Any Aave protocol referral code
struct PositionSwapperParams {
    address usdc;
    address ausdc;
    address usdt;
    address ausdt;
    address outToken;
    address aavePool;
    address router;
    address quoter;
    uint256 amountUsdc;
    uint256 amountUsdt;
    address beneficiary;
    uint16 aaveRefCode;
}