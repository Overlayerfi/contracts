// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRewardAsset {
    function mint(address to, uint256 amount) external;
}

/// @title OvaAmbassadorTracker Contract
contract OvaAmbassadorTracker is Ownable, ReentrancyGuard {
    event Collection(address indexed who, uint256 amount);

    event CollectionTimeSet(uint256 time);

    event RewardSet(address indexed reward);

    event NewAmbassador(address indexed who);

    event PointsSet(AmbassadorPoint[] points);

    event RemoveAmbassador(address indexed who);

    error OvaAmbassadorTrackerOperatorNotAllowed();

    struct AmbassadorPoint {
        uint256 points;
        address who;
    }

    /// @notice Ambassadors accounting
    mapping(address => uint256) public ambassadorsTracker;

    /// @notice Ambassadors
    mapping(address => bool) public ambassadors;

    /// @notice Tracks the number of whitelisted users.
    uint256 private numAmbassadors;

    /// @notice Ambdassador reward token
    address public reward;

    /// @notice Ambdassadors collection time
    uint256 public collectTime;

    /// @notice Initializes the contract and sets the owner.
    /// @param admin The address that will be assigned as the owner.
    constructor(address admin) Ownable(admin) {}

    /// @notice Add a new ambassador
    /// @param who The ambassador address
    function addAmbassador(address who) public onlyOwner {
        if (who == address(0)) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        if (ambassadors[who] == true) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        ambassadors[who] = true;
        numAmbassadors += 1;

        emit NewAmbassador(who);
    }

    /// @notice Set the collection time
    /// @param time The timestamp
    function setCollectionTime(uint256 time) external onlyOwner {
        if (time < block.timestamp) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        collectTime = time;
        emit CollectionTimeSet(time);
    }

    /// @notice Set the reward token
    /// @param reward_ The reward token address
    function setReward(address reward_) external onlyOwner {
        reward = reward_;
        emit RewardSet(reward);
    }

    /// @notice Add a new ambassadors
    /// @param who The ambassadors addresses
    function addAmbassadorBatch(address[] memory who) external onlyOwner {
        for (uint256 i = 0; i < who.length; ) {
            addAmbassador(who[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Remove an ambassador
    /// @param who The ambassador address
    function removeAmbassador(address who) external onlyOwner {
        if (who == address(0)) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        if (!ambassadors[who]) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        ambassadors[who] = false;
        ambassadorsTracker[who] = 0;
        numAmbassadors -= 1;

        emit RemoveAmbassador(who);
    }

    /// @notice Set ambdassador points
    /// @param points The ambdassador points to be set
    function setAmbassadorPoints(
        AmbassadorPoint[] memory points
    ) external onlyOwner {
        for (uint256 i = 0; i < points.length; ) {
            if (!ambassadors[points[i].who]) {
                revert OvaAmbassadorTrackerOperatorNotAllowed();
            }
            ambassadorsTracker[points[i].who] += points[i].points;
            unchecked {
                i++;
            }
        }
    }

    /// @notice Collect the reward
    function collect() external nonReentrant {
        if (reward == address(0)) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        address recipient = msg.sender;
        if (!ambassadors[recipient]) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        if (collectTime == 0 || block.timestamp < collectTime) {
            revert OvaAmbassadorTrackerOperatorNotAllowed();
        }
        uint256 amount = ambassadorsTracker[recipient];
        ambassadorsTracker[recipient] = 0;
        IRewardAsset(reward).mint(recipient, amount);

        emit Collection(recipient, amount);
    }
}
