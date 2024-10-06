// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

interface IOvaReferral {
    function referredFrom(address user) external view returns(address);
    function seeReferred(address user) external view returns(address[] memory);
    function generatePoints(address user) external view returns(uint256);
    function track(address user, uint256 amount) external;
    function consumeReferral(address source, address consumer) external; 
}
