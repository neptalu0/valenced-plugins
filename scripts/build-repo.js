import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

function crc32(buf) {
	let crc = ~0
	for (let i = 0; i < buf.length; i++) {
		crc ^= buf[i]
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
		}
	}
	return (~crc) >>> 0
}

function makeZip(files) {
	const localHeaders = []
	const centralHeaders = []
	let offset = 0

	for (const file of files) {
		const nameBuf = Buffer.from(file.name, 'utf8')
		const rawData = Buffer.isBuffer(file.content)
			? file.content
			: Buffer.from(file.content, 'utf8')
		const uncompressedSize = rawData.length
		const fileCrc = crc32(rawData)
		const compressedData = zlib.deflateRawSync(rawData)
		const compressedSize = compressedData.length

		// Local file header (30 bytes + name length)
		const localHeader = Buffer.alloc(30 + nameBuf.length)
		localHeader.writeUInt32LE(0x04034b50, 0)
		localHeader.writeUInt16LE(20, 4)
		localHeader.writeUInt16LE(0, 6)
		localHeader.writeUInt16LE(8, 8)
		localHeader.writeUInt16LE(0, 10)
		localHeader.writeUInt16LE(0, 12)
		localHeader.writeUInt32LE(fileCrc, 14)
		localHeader.writeUInt32LE(compressedSize, 18)
		localHeader.writeUInt32LE(uncompressedSize, 22)
		localHeader.writeUInt16LE(nameBuf.length, 26)
		localHeader.writeUInt16LE(0, 28)
		nameBuf.copy(localHeader, 30)

		localHeaders.push(localHeader, compressedData)

		// Central directory header (46 bytes + name length)
		const centralHeader = Buffer.alloc(46 + nameBuf.length)
		centralHeader.writeUInt32LE(0x02014b50, 0)
		centralHeader.writeUInt16LE(20, 4)
		centralHeader.writeUInt16LE(20, 6)
		centralHeader.writeUInt16LE(0, 8)
		centralHeader.writeUInt16LE(8, 10)
		centralHeader.writeUInt16LE(0, 12)
		centralHeader.writeUInt16LE(0, 14)
		centralHeader.writeUInt32LE(fileCrc, 16)
		centralHeader.writeUInt32LE(compressedSize, 20)
		centralHeader.writeUInt32LE(uncompressedSize, 24)
		centralHeader.writeUInt16LE(nameBuf.length, 28)
		centralHeader.writeUInt16LE(0, 30)
		centralHeader.writeUInt16LE(0, 32)
		centralHeader.writeUInt16LE(0, 34)
		centralHeader.writeUInt16LE(0, 36)
		centralHeader.writeUInt32LE(0, 38)
		centralHeader.writeUInt32LE(offset, 42)
		nameBuf.copy(centralHeader, 46)

		centralHeaders.push(centralHeader)
		offset += localHeader.length + compressedData.length
	}

	const centralDirOffset = offset
	let centralDirSize = 0
	for (const ch of centralHeaders) {
		centralDirSize += ch.length
	}

	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(0, 4)
	eocd.writeUInt16LE(0, 6)
	eocd.writeUInt16LE(files.length, 8)
	eocd.writeUInt16LE(files.length, 10)
	eocd.writeUInt32LE(centralDirSize, 12)
	eocd.writeUInt32LE(centralDirOffset, 16)
	eocd.writeUInt16LE(0, 20)

	return Buffer.concat([...localHeaders, ...centralHeaders, eocd])
}

const BaseUrl = 'https://neptalu0.github.io/valenced-plugins'
const OutDir = 'build/pages'

fs.mkdirSync(OutDir, { recursive: true })

let repoConfig = {
	name: 'neptalu0 plugins',
	description: 'Plugins by neptalu0 for Valenced.',
}
if (fs.existsSync('repo.config.json')) {
	try {
		repoConfig = JSON.parse(fs.readFileSync('repo.config.json', 'utf8'))
	} catch {}
}

const pluginsMap = {}

const pluginDirs = fs.existsSync('plugins')
	? fs.readdirSync('plugins').sort()
	: []

for (const name of pluginDirs) {
	const dir = path.join('plugins', name)
	const manifestPath = path.join(dir, 'manifest.json')
	if (!fs.existsSync(manifestPath)) continue

	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
	const id = manifest.id
	const version = manifest.version || '1.0.0'

	let scriptContent = null
	if (fs.existsSync(path.join(dir, 'index.js'))) {
		scriptContent = fs.readFileSync(path.join(dir, 'index.js'))
	} else if (fs.existsSync(path.join(dir, 'build', 'js', 'index.js'))) {
		scriptContent = fs.readFileSync(path.join(dir, 'build', 'js', 'index.js'))
	} else {
		console.warn(`Skipping ${name}: no index.js bundle found`)
		continue
	}

	const zipBuf = makeZip([
		{ name: 'manifest.json', content: fs.readFileSync(manifestPath) },
		{ name: 'index.js', content: scriptContent },
	])

	const zipName = `${id}@${version}.zip`
	fs.writeFileSync(path.join(OutDir, zipName), zipBuf)

	const sha256 = crypto.createHash('sha256').update(zipBuf).digest('hex')

	pluginsMap[id] = {
		name: manifest.name,
		description: manifest.description,
		author: manifest.author,
		contributors: manifest.contributors || [],
		icon: manifest.icon || 'TranslateIcon',
		channels: {
			latest: version,
		},
		versions: {
			[version]: {
				url: `${BaseUrl}/${zipName}`,
				sha256,
				size: zipBuf.length,
				dependencies: manifest.dependencies || {
					'valenced.api': { version: '>=1 <2' },
					discord: { version: '*' },
				},
			},
		},
	}

	console.log(`Packed ${zipName} (${zipBuf.length} bytes, sha256: ${sha256.slice(0, 8)}...)`)
}

const indexJson = {
	format: 1,
	name: repoConfig.name,
	description: repoConfig.description,
	plugins: pluginsMap,
}

fs.writeFileSync(path.join(OutDir, 'index.json'), JSON.stringify(indexJson, null, 2))
console.log(`Generated repository index: ${path.join(OutDir, 'index.json')}`)
