// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

interface IAaveHandlerDefs {
    error AaveHandlerZeroAddressException();

    error AaveHandlerSameAddressException();

    error AaveHandlerCantRenounceOwnership();

    error AaveHandlerOperationNotAllowed();

    error AaveHandlerCallerIsNotUsdo();

    error AaveHandlerUnexpectedAmount();

    error AaveHandlerAaveWithrawFailed();

    error AaveHandlerInsufficientBalance();

    error AaveHandlerInsufficientABalance();

    error AaveIntervalNotRespected();

    event AaveActionFailed(string message, bytes reason);

    event AaveWithdraw(uint256 usdt);

    event AaveSupply(uint256 usdt);

    event AaveNewAave(address indexed addr);

    event AaveNewTeamAllocation(uint8 amount);

    event AaveNewRewardsDispatcher(address indexed addr);

    event AaveSwapPosition(uint256 usdt, uint256 out);
}
