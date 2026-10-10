// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {PortionlySplitterV2} from "./PortionlySplitterV2.sol";

/// @title PortionlyLink
/// @notice Lets a sender portion a payment for someone who has no account yet.
/// @dev The sender makes a one time key and shares it as a link. The payment waits here under that
/// key's address. Whoever holds the key sends `claim` from it, naming the account that should
/// receive, and the splitter then routes the portions exactly as a direct payment would. The key
/// is a bearer secret: anyone who has the link can claim, so the sender can take the payment back
/// at any time before that happens. No owner, no admin, no upgrade path.
contract PortionlyLink is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint32 public constant MIN_LOCK_DAYS = 30;
    uint32 public constant MAX_LOCK_DAYS = 366;
    /// @dev PortionlyFuture needs the unlock time to be at least 30 days after the lock is made.
    uint256 private constant LOCK_MARGIN = 1 hours;

    struct Payment {
        address sender;
        uint256 nowAmount;
        uint256 growAmount;
        uint256 investAmount;
        uint32 lockDays;
        uint64 createdAt;
        bool open;
    }

    IERC20 public immutable ausd;
    PortionlySplitterV2 public immutable splitter;
    mapping(address link => Payment) public payments;
    mapping(address sender => address[]) private _sent;

    error EmptyAmount();
    error InvalidConfiguration();
    error InvalidLink();
    error InvalidLock();
    error InvalidRecipient();
    error LinkInUse();
    error NothingToClaim();
    error NotTheSender();

    event LinkCreated(
        address indexed link,
        address indexed sender,
        uint256 nowAmount,
        uint256 growAmount,
        uint256 investAmount,
        uint32 lockDays
    );
    event LinkClaimed(address indexed link, address indexed recipient, bytes32 planId);
    event LinkCancelled(address indexed link, address indexed sender, uint256 refunded);

    constructor(IERC20 ausd_, PortionlySplitterV2 splitter_) {
        if (address(ausd_) == address(0) || address(splitter_) == address(0)) revert InvalidConfiguration();
        if (address(splitter_.ausd()) != address(ausd_)) revert InvalidConfiguration();
        ausd = ausd_;
        splitter = splitter_;
    }

    /// @notice Park a portioned payment under a one time link address.
    /// @param lockDays 0 to hand savings straight over, or 30 to 366 to lock them from the day of the claim.
    function create(address link, uint256 nowAmount, uint256 growAmount, uint256 investAmount, uint32 lockDays)
        external
        nonReentrant
    {
        if (link == address(0) || link == address(this)) revert InvalidLink();
        if (payments[link].sender != address(0)) revert LinkInUse();
        uint256 total = nowAmount + growAmount + investAmount;
        if (total == 0) revert EmptyAmount();
        if (lockDays != 0 && (lockDays < MIN_LOCK_DAYS || lockDays > MAX_LOCK_DAYS || growAmount == 0)) {
            revert InvalidLock();
        }

        payments[link] = Payment({
            sender: msg.sender,
            nowAmount: nowAmount,
            growAmount: growAmount,
            investAmount: investAmount,
            lockDays: lockDays,
            createdAt: uint64(block.timestamp),
            open: true
        });
        _sent[msg.sender].push(link);
        ausd.safeTransferFrom(msg.sender, address(this), total);

        emit LinkCreated(link, msg.sender, nowAmount, growAmount, investAmount, lockDays);
    }

    /// @notice Called from the link key itself. Routes every portion to `recipient`.
    /// @param investMinimumOut The least stock the recipient accepts; must be zero when nothing is invested.
    /// If the stock purchase cannot meet it, that portion goes to savings instead.
    function claim(address recipient, uint256 investMinimumOut, uint256 deadline) external nonReentrant {
        Payment storage payment = payments[msg.sender];
        if (!payment.open) revert NothingToClaim();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        payment.open = false;

        uint256 total = payment.nowAmount + payment.growAmount + payment.investAmount;
        bytes32 planId = planIdOf(msg.sender);
        uint64 unlockAt =
            payment.lockDays == 0 ? 0 : uint64(block.timestamp + uint256(payment.lockDays) * 1 days + LOCK_MARGIN);

        ausd.forceApprove(address(splitter), total);
        splitter.execute(
            PortionlySplitterV2.Plan({
                recipient: recipient,
                nowAmount: payment.nowAmount,
                growAmount: payment.growAmount,
                investAmount: payment.investAmount,
                investMinimumOut: investMinimumOut,
                fallbackInvestToGrow: true,
                unlockAt: unlockAt,
                deadline: deadline,
                planId: planId
            })
        );
        ausd.forceApprove(address(splitter), 0);

        emit LinkClaimed(msg.sender, recipient, planId);
    }

    /// @notice The sender takes an unclaimed payment back.
    function cancel(address link) external nonReentrant {
        Payment storage payment = payments[link];
        if (!payment.open) revert NothingToClaim();
        if (payment.sender != msg.sender) revert NotTheSender();
        payment.open = false;

        uint256 total = payment.nowAmount + payment.growAmount + payment.investAmount;
        ausd.safeTransfer(msg.sender, total);

        emit LinkCancelled(link, msg.sender, total);
    }

    /// @notice Every link a sender has made, oldest first.
    function sentBy(address sender) external view returns (address[] memory) {
        return _sent[sender];
    }

    /// @notice The splitter plan id a link's payment settles under.
    function planIdOf(address link) public pure returns (bytes32) {
        return keccak256(abi.encode("PORTIONLY_LINK", link));
    }
}
