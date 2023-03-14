import { join, extname } from 'path';
import fs = require('fs');

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
const modulesPath = 'modules';
const outputPath = 'resources/godot_icons';
const godotPath = process.argv[2];

const util = require('node:util');
const _exec = util.promisify(require('node:child_process').exec);

async function exec(command) {
	const { stdout, stderr } = await _exec(command);
	return stdout;
}

const git = {
	diff: 'git diff HEAD',
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

function get_class_list(modules) {
	const classes = [];

	const files = ['scene/register_scene_types.cpp'];
	modules.forEach(mod => {
		files.push(join(mod, 'register_types.cpp'));
	});

	const patterns = [
		/GDREGISTER_CLASS\((\w*)\)/,
		/register_class<(\w*)>/,
	];

	files.forEach(fileName => {
		const file = fs.readFileSync(fileName, 'utf8');
		file.split('\n').forEach(line => {
			patterns.forEach(pattern => {
				const match = line.match(pattern);
				if (match) {
					classes.push(match[1] + '.svg');
				}
			});
		});
	});


	return classes;
}

function discover_modules() {
	const modules = []

	// a valid module is a subdir of modulesPath, and contains a subdir 'icons'
	fs.readdirSync(modulesPath, {withFileTypes:true}).forEach(mod => {
		if (mod.isDirectory()) {
			fs.readdirSync(join(modulesPath, mod.name), {withFileTypes:true}).forEach(child => {
				if (child.isDirectory() && child.name == 'icons') {
					modules.push(join(modulesPath, mod.name));
				}
			});
		}
	});
	return modules;
}


function get_icons() {
	const modules = discover_modules();
	const classes = get_class_list(modules);

	const searchPaths = [iconsPath]
	modules.forEach(mod => {
		searchPaths.push(join(mod, 'icons'));
	});

	const icons = [];
	searchPaths.forEach(searchPath => {
		fs.readdirSync(searchPath).forEach(file => {
			if (extname(file) === '.svg') {
				let name = file;
				if (name.startsWith('icon_')) {
					name = name.replace('icon_', '');
					let parts = name.split('_');
					parts = parts.map(to_title_case);
					name = parts.join('');
				}
				if (!classes.includes(name)) {
					return;
				}
				const f = {
					name: name,
					contents: fs.readFileSync(join(searchPath, file), 'utf8')
				};
				icons.push(f);
			}
		});
	});
	
	return icons;
}

function ensure_paths() {
	const paths = [
		outputPath,
		join(outputPath, 'light'),
		join(outputPath, 'dark'),
	];

	paths.forEach(path => {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}
	});
}

async function run() {
	if (godotPath == undefined) {
		console.log('Please provide the absolute path to your godot repo');
		return;
	}

	const original_cwd = process.cwd();

	process.chdir(godotPath);

	const diff = (await exec(git.diff)).trim();
	if (diff) {
		console.log('There appear to be uncommitted changes in your godot repo');
		console.log('Revert or stash these changes and try again');
		return;
	}

	const branch = (await exec(git.check_branch)).trim();

	console.log('Gathering Godot 3 icons...');
	await exec(git.checkout_3);
	const g3 = get_icons();

	console.log('Gathering Godot 4 icons...');
	await exec(git.checkout_4);
	const g4 = get_icons();

	await exec(git.checkout + branch);

	process.chdir(original_cwd);

	console.log(`Found ${g3.length + g4.length} icons...`);

	const light_icons = {};
	const dark_icons = {};

	console.log('Generating themed icons...');
	g3.forEach(file => {
		light_icons[file.name] = replace_colors(light_colors, file.contents);
	});
	g4.forEach(file => {
		light_icons[file.name] = replace_colors(light_colors, file.contents);
	});
	g3.forEach(file => {
		dark_icons[file.name] = replace_colors(dark_colors, file.contents);
	});
	g4.forEach(file => {
		dark_icons[file.name] = replace_colors(dark_colors, file.contents);
	});

	console.log('Ensuring output directory...');
	ensure_paths();

	console.log('Writing icons to output directory...');
	for (const [file, contents] of Object.entries(light_icons)) {
		fs.writeFileSync(join(outputPath, 'light', file), contents);
	}
	for (const [file, contents] of Object.entries(dark_icons)) {
		fs.writeFileSync(join(outputPath, 'dark', file), contents);
	}
}

run();
