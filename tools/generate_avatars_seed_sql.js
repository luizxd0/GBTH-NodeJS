#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const datPath = process.argv[2] || process.env.AVATAR_DAT_PATH || 'C:/tools/dat files';
const outputPath = process.argv[3] || path.resolve(__dirname, '../server/sql/avatars_seed.sql');
const projectPath = path.resolve(__dirname, 'dat_seed_builder/dat_seed_builder.csproj');

const result = spawnSync(
    'dotnet',
    ['run', '--project', projectPath, '--', datPath, outputPath],
    {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',

    }
);

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 1);
