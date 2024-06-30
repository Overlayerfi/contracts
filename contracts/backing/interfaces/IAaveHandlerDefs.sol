// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/**
 * @title IAaveHandlerDefs
 */
interface IAaveHandlerDefs {
    error AaveHandlerZeroAddressException();

    error AaveHandlerSameAddressException();

    error AaveHandlerCantRenounceOwnership();

    error AaveHandlerOperationNotAllowed();

    error AaveHandlerAaveWithrawFailed();

    error AaveHandlerInsufficientBalance();

    error AaveIntervalNotRespected();

    event AaveActionFailed(string message, bytes reason);

    event AaveWithdraw(uint256 usdc, uint256 usdt);

    event AaveSupply(uint256 usdc, uint256 usdt);

    event AaveNewAave(address addr);

    event AaveNewTeamAllocation(uint8 amount);

    event AaveNewTreasury(address addr);
}
