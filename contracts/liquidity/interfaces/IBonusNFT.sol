// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Bonus fraction interface for NFTs that boost liquidity farming rewards.
 */
interface IBonusNFT {
    /// @notice Numerator of the collection's exact bonus fraction.
    function bonusNumerator() external view returns (uint256);

    /// @notice Denominator of the collection's exact bonus fraction.
    function bonusDenominator() external view returns (uint256);
}
