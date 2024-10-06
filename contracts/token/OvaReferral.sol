// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./GovernanceTokenBase.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OvaReferral
 * @notice This token represent the airdrop token to receive the governance OVAG token.
 */
contract OvaReferral is GovernanceTokenBase, ReentrancyGuard {
    /// @notice Track the referral source for given address
    mapping(address => address) public referredFrom;

    /// @notice Track all the referred users for a given address
    mapping(address => address[]) public referredUsers;

    /// @notice Track all the generated referral points for given address
    mapping(address => uint256) public generatedPoints;

    event Referral(address indexed source, address consumer);

    error OvaReferralAlreadyReferred();
    error OvaReferralZeroAddress();

    ///@notice The constructor
    ///@param admin The contract admin
    constructor(address admin) GovernanceTokenBase(admin, "AOVA", "AOVA") {}

    /// @notice Create a new referral
    /// @param source The referral source
    function consumeReferral(address source) external nonReentrant {
        if (referredFrom[msg.sender] != address(0)) {
            revert OvaReferralAlreadyReferred();
        }

        if (source == address(0)) revert OvaReferralZeroAddress();

        referredFrom[msg.sender] = source;
        referredUsers[source].push(msg.sender);

        emit Referral(source, msg.sender);
    }

    /// @notice Retrieve all the referred user for a given address
    /// @param source The query key
    /// @return All the referred user addresses
    function seeReferred(
        address source
    ) external view returns (address[] memory) {
        return referredUsers[source];
    }
}
