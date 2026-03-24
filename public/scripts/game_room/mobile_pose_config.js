(() => {
    // Canonical client-inspired mapping/config for ready-room mobile + avatar pose.
    // selectionIndex: UI/button selection value (1..15)
    // assetIndex: rendered mobile asset (0 = rider, 1..16 = tank folders)
    window.GBTH_MOBILE_POSE_CONFIG = {
        version: 2,
        // Keep disabled until each room animation sequence is mapped 1:1 to client timelines.
        useFrameAnchorDeltas: false,
        // Link avatar seat position to the rendered mobile offset so both move together.
        avatarSync: {
            enabled: true,
            // Keep avatar seat anchored to Rider baseline, then apply mobile delta.
            useReferenceAvatarOffset: true,
            referenceMobileOffset: { x: -19, y: -13 },
            xFactor: 1,
            yFactor: 1,
            maxDeltaX: 40,
            maxDeltaY: 56,
            disabledAssets: [0],
            // Disable per-frame seat wobble for mobiles where holdspot deltas look wrong in room preview.
            frameSeatDeltaDisabledAssets: [3, 4, 5, 6, 9, 11, 12, 13, 16],
            // Legacy fallback only. Prefer assets[*].seatAdjust below.
            seatAdjustByAsset: {},
            // Team B fallback tuning map (same shape as seatAdjustByAsset).
            seatAdjustByAssetTeamB: {}
        },
        selectionToAsset: {
            1: 1,
            2: 2,
            3: 3,
            4: 4,
            5: 5,
            6: 6,
            7: 7,
            8: 8,
            9: 9,
            10: 10,
            11: 11,
            12: 12,
            13: 13,
            14: 16, // Aduka selection
            15: 0   // Random selection -> Rider
        },
        assets: {
            // Optional Team B overrides per asset:
            // - mobileOffsetTeamB: { x, y }
            // - seatAdjustTeamB: { left, bottom }
            // - avatarOffsetTeamB: { left, bottom }
            0: { mobileOffset: { x: -19, y: -23 }, mobileOffsetTeamB: { x: -54, y: -23 }, seatAdjust: { left: 0, bottom: -10 }, seatAdjustTeamB: { left: -35, bottom: -10 }, avatarOffset: { left: 2, bottom: 19 }, avatarOffsetTeamB: { left: 2, bottom: 19 } },   // rider.img frame0 anchor
            1: { mobileOffset: { x: -21, y: -37 }, mobileOffsetTeamB: { x: -51, y: -37 }, seatAdjust: { left: -8, bottom: -10 }, seatAdjustTeamB: { left: -8, bottom: -10 }, avatarOffset: { left: 1, bottom: 20 }, avatarOffsetTeamB: { left: 1, bottom: 20 } },   // tank1.img frame0 anchor
            2: { mobileOffset: { x: -25, y: -34 }, mobileOffsetTeamB: { x: -50, y: -34 }, seatAdjust: { left: 0, bottom: -10 }, seatAdjustTeamB: { left: 0, bottom: -10 }, avatarOffset: { left: 0, bottom: 20 }, avatarOffsetTeamB: { left: 0, bottom: 20 } }, // tank2.img frame0 anchor
            3: { mobileOffset: { x: -23, y: -37 }, mobileOffsetTeamB: { x: -55, y: -37 }, seatAdjust: { left: 15, bottom: -10 }, seatAdjustTeamB: { left: 15, bottom: -10 }, avatarOffset: { left: 0, bottom: 23 }, avatarOffsetTeamB: { left: 0, bottom: 23 } },   // tank3.img frame0 anchor
            4: { mobileOffset: { x: -23, y: -38 }, mobileOffsetTeamB: { x: -55, y: -38 }, seatAdjust: { left: 10, bottom: 0 }, seatAdjustTeamB: { left: 10, bottom: 0 }, avatarOffset: { left: -1, bottom: 17 }, avatarOffsetTeamB: { left: -1, bottom: 17 } },  // tank4.img frame0 anchor
            5: { mobileOffset: { x: -24, y: -38 }, mobileOffsetTeamB: { x: -55, y: -38 }, seatAdjust: { left: 10, bottom: -5 }, seatAdjustTeamB: { left: 10, bottom: -5 }, avatarOffset: { left: 0, bottom: 19 }, avatarOffsetTeamB: { left: 0, bottom: 19 } },   // tank5.img frame0 anchor
            6: { mobileOffset: { x: -20, y: -35 }, mobileOffsetTeamB: { x: -55, y: -35 }, seatAdjust: { left: -7, bottom: -13 }, seatAdjustTeamB: { left: -7, bottom: -13 }, avatarOffset: { left: 1, bottom: 21 }, avatarOffsetTeamB: { left: 1, bottom: 21 } },   // tank6.img frame0 anchor
            7: { mobileOffset: { x: -21, y: -39 }, mobileOffsetTeamB: { x: -55, y: -39 }, seatAdjust: { left: -7, bottom: -5 }, seatAdjustTeamB: { left: -7, bottom: -5 }, avatarOffset: { left: 0, bottom: 20 }, avatarOffsetTeamB: { left: 0, bottom: 20 } },   // tank7.img frame0 anchor
            8: { mobileOffset: { x: -19, y: -35 }, mobileOffsetTeamB: { x: -55, y: -35 }, seatAdjust: { left: -7, bottom: -10 }, seatAdjustTeamB: { left: -7, bottom: -10 }, avatarOffset: { left: 0, bottom: 21 }, avatarOffsetTeamB: { left: 0, bottom: 21 } },   // tank8.img frame0 anchor
            9: { mobileOffset: { x: -25, y: -38 }, mobileOffsetTeamB: { x: -55, y: -38 }, seatAdjust: { left: -6, bottom: -5 }, seatAdjustTeamB: { left: -6, bottom: -5 }, avatarOffset: { left: 1, bottom: 19 }, avatarOffsetTeamB: { left: 1, bottom: 19 } },   // tank9.img frame0 anchor
            10: { mobileOffset: { x: -25, y: -32 }, mobileOffsetTeamB: { x: -55, y: -32 }, seatAdjust: { left: 5, bottom: -10 }, seatAdjustTeamB: { left: 5, bottom: -10 }, avatarOffset: { left: 0, bottom: 24 }, avatarOffsetTeamB: { left: 0, bottom: 24 } }, // tank10.img frame0 anchor
            11: { mobileOffset: { x: -25, y: -35 }, mobileOffsetTeamB: { x: -55, y: -35 }, seatAdjust: { left: 10, bottom: 0 }, seatAdjustTeamB: { left: 10, bottom: 0 }, avatarOffset: { left: -1, bottom: 15 }, avatarOffsetTeamB: { left: -1, bottom: 15 } }, // tank11.img frame0 anchor
            12: { mobileOffset: { x: -26, y: -36 }, mobileOffsetTeamB: { x: -55, y: -36 }, seatAdjust: { left: 10, bottom: 0 }, seatAdjustTeamB: { left: 10, bottom: 0 }, avatarOffset: { left: 0, bottom: 18 }, avatarOffsetTeamB: { left: 0, bottom: 18 } },  // tank12.img frame0 anchor
            13: { mobileOffset: { x: -25, y: -41 }, mobileOffsetTeamB: { x: -55, y: -41 }, seatAdjust: { left: 0, bottom: 0 }, seatAdjustTeamB: { left: 0, bottom: 0 }, avatarOffset: { left: 0, bottom: 19 }, avatarOffsetTeamB: { left: 0, bottom: 19 } },  // tank13.img frame0 anchor
            14: { mobileOffset: { x: -33, y: -61 }, mobileOffsetTeamB: { x: -55, y: -61 }, seatAdjust: { left: 0, bottom: 0 }, seatAdjustTeamB: { left: 0, bottom: 0 }, avatarOffset: { left: -2, bottom: 13 }, avatarOffsetTeamB: { left: -2, bottom: 13 } }, // tank14.img frame0 anchor
            15: { mobileOffset: { x: -35, y: -49 }, mobileOffsetTeamB: { x: -55, y: -49 }, seatAdjust: { left: 0, bottom: 0 }, seatAdjustTeamB: { left: 0, bottom: 0 }, avatarOffset: { left: -1, bottom: 16 }, avatarOffsetTeamB: { left: -1, bottom: 16 } }, // tank15.img frame0 anchor
            16: { mobileOffset: { x: -23, y: -34 }, mobileOffsetTeamB: { x: -55, y: -34 }, seatAdjust: { left: 20, bottom: -10 }, seatAdjustTeamB: { left: 20, bottom: -10 }, avatarOffset: { left: -1, bottom: 21 }, avatarOffsetTeamB: { left: -1, bottom: 21 } }  // tank16.img frame0 anchor (Aduka)
        },
        // Per-frame deltas extracted from original IMG anchor metadata.
        // Values are [dx, dy] relative to each mobile frame 0 anchor.
        frameAnchorDeltas: {
            2: [[0,0],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,0],[0,0],[0,0]],
            3: [[0,0],[0,-1],[0,-1],[0,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,0],[0,0]],
            4: [[0,0],[0,0],[0,0],[0,0],[0,0],[2,0],[4,-1],[4,-1],[4,-1],[4,-2],[5,-2],[-1,-5],[-6,-8],[-6,-7],[-6,-7],[-3,-7],[1,-5],[1,-3],[0,0],[0,0]],
            5: [[0,0],[0,0],[0,0],[0,0],[0,0],[-1,0],[-1,0],[0,0],[0,0],[0,0],[0,0],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1]],
            6: [[0,0],[0,0],[0,0],[0,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
            7: [[0,0],[0,0],[0,0],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,1],[0,0],[0,0],[0,0]],
            9: [[0,0],[0,0],[0,0],[-1,0],[-1,0],[-1,0],[-1,0],[-1,0],[-1,0],[-1,0],[0,0],[0,0],[0,0],[0,1],[0,1],[0,1],[0,1],[0,0],[0,0],[0,0]],
            10: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
            12: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[-1,1]],
            13: [[0,0],[0,0],[0,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[1,0],[0,0],[0,0],[0,0],[0,0],[0,1]],
            14: [[0,0],[1,1],[1,2],[1,3],[2,3],[2,4],[2,5],[3,6],[3,6],[2,6],[2,5],[1,5],[1,5],[1,4],[1,3],[1,3],[1,2],[1,2],[0,1],[0,0]],
            15: [[0,0],[0,0],[0,0],[0,1],[-1,1],[-1,1],[-1,1],[-1,1],[-1,1],[-1,1],[-1,1],[-1,1],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
            16: [[0,0],[0,1],[-1,3],[-1,5],[-1,4],[-1,4],[-1,2],[-1,0],[-1,-1],[-1,-1],[-1,-1],[-1,0],[-1,2],[-1,4],[-1,4],[-1,5],[-1,3],[0,2],[0,1],[0,1]]
        }
    };
})();
