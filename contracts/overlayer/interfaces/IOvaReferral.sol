// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IOvaReferral {
    function referredFrom(address user) external view returns (address);
    function referralCodes(string memory code) external view returns (address);
    function seeReferred(address user) external view returns (address[] memory);
    function generatedPoints(address user) external view returns (uint256);
    function track(address user, uint256 amount) external;
    function consumeReferral(string memory code) external;
}
