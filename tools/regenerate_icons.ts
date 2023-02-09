import path = require("path");
import { join } from "path";
import fs = require("fs");

const dark_colors = {
    '#fc7f7f': '#fc9c9c',
    '#8da5f3': '#a5b7f3',
    '#e0e0e0': '#e0e0e0',
    '#c38ef1': '#cea4f1',
    '#8eef97': '#a5efac',
};
const light_colors = {
    '#fc7f7f': '#ff5f5f',
    '#8da5f3': '#6d90ff',
    '#e0e0e0': '#4f4f4f',
    '#c38ef1': '#bb6dff',
    '#8eef97': '#29d739',
};

function replace_colors(colors: Object, data: String) {
    for (const [from, to] of Object.entries(colors)) {
        data = data.replace(from, to);
    }
    return data;
}

const iconsPath = 'editor/icons';
const outputPath = 'resources/godot_icons';
const godotPath = process.argv[2];

const util = require('node:util');
const _exec = util.promisify(require('node:child_process').exec);

async function exec(command) {
    const { stdout, stderr } = await _exec(command);
    return stdout;
}

const git = {
    check_branch: 'git rev-parse --abbrev-ref HEAD',
    reset: 'git reset --hard',
    stash_push: 'git stash push',
    stash_pop: 'git stash pop',
    checkout: 'git checkout ',
    checkout_4: 'git checkout master',
    checkout_3: 'git checkout 3.x',
};

function to_title_case(str) {
    return str.replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

function get_icons() {
    let icons = [];
    fs.readdirSync('./editor/icons').forEach(file => {
        if (path.extname(file) === '.svg') {
            let name = file;
            if (name.startsWith('icon_')) {
                name = name.replace('icon_', '');
                let parts = name.split('_');
                parts = parts.map(to_title_case);
                name = parts.join('');
            }
            let f = {
                name: name,
                contents: fs.readFileSync(join(iconsPath, file), 'utf8')
            };
            icons.push(f);
        }
    })
    return icons;
}

async function run() {
    if (godotPath == undefined) {
        console.log('Please provide the path to your godot repo');
        return;
    }

    const original_cwd = process.cwd();

    process.chdir(godotPath);
    const branch = (await exec(git.check_branch)).trim();

    // await exec(git.stash_push);
    await exec(git.checkout_3);
    let g3 = get_icons();

    await exec(git.checkout_4);
    let g4 = get_icons();

    await exec(git.checkout + branch);
    // await exec(git.stash_pop);

    process.chdir(original_cwd);

    let light_icons = {};
    let dark_icons = {};

    g3.forEach(file => {
        light_icons[file.name] = replace_colors(light_colors, file.contents);
    })
    g4.forEach(file => {
        light_icons[file.name] = replace_colors(light_colors, file.contents);
    })
    g3.forEach(file => {
        dark_icons[file.name] = replace_colors(dark_colors, file.contents);
    })
    g4.forEach(file => {
        dark_icons[file.name] = replace_colors(dark_colors, file.contents);
    })

    fs.mkdirSync(outputPath)
    fs.mkdirSync(join(outputPath, 'light'))
    fs.mkdirSync(join(outputPath, 'dark'))

    for (const [file, contents] of Object.entries(light_icons)) {
        fs.writeFileSync(join(outputPath, 'light', file), contents);
    }
    for (const [file, contents] of Object.entries(dark_icons)) {
        fs.writeFileSync(join(outputPath, 'dark', file), contents);
    }
}

run();
