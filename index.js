const readline = require("readline");
const process = require("process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");

const on = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const readDirectory = async (dir) => {
  try {
    const files = await fs.readdir(dir, { withFileTypes: false });
    console.log(`[Total File]: ${files.length}`);
    const filteredFiles = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        return stat.isFile() ? file : null;
      })
    );
    return filteredFiles.filter(Boolean);
  } catch (err) {
    console.error("Error reading directory", err);
  }
};

const readHashId = async (file) => {
  try {
    const fileBuffer = await fs.readFile(file);
    const hashId = crypto.createHash("sha256");
    hashId.update(fileBuffer);
    const hex = hashId.digest("hex");
    return hex;
  } catch (err) {
    console.error(`Error reading hash of ${file}`, err);
  }
};

const storeDuplicated = (files) => {
  const set = new Set();
  const duplicates = files.filter((file) => {
    if (set.has(file.hash)) return true;
    else {
      set.add(file.hash);
      return false;
    }
  });
  console.log(`[Total Duplicated]: ${duplicates.length}`);
  return duplicates;
};

const compareHash = (originalFileHashes, storedFileHashes) => {
  const set = new Set();
  for (const file of originalFileHashes) set.add(file.hash);
  const files = storedFileHashes.filter((file) => set.has(file.hash));
  return files;
};

const transferDuplicated = async (files, origin, dest) => {
  await fs.mkdir(dest, { recursive: true });
  const renamePromises = files.map((file) =>
    fs.rename(`${origin}/${file.name}`, `${dest}/${file.name}`)
  );
  await Promise.all(renamePromises);
};

const viewInFolder = (dest) => {
  const child = spawn(
    process.platform === "win32" ? "explorer" : "xdg-open",
    [dest],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  child.unref();
  child.on("close", () => process.exit());
};

const run = async () => {
  const dir = await new Promise((resolve) =>
    on.question("Enter the directory: ", (answer) => resolve(answer))
  );

  const hashes = [];
  const files = await readDirectory(dir);
  for (const file of files) {
    if (file.startsWith(".")) continue;
    const fromDirectory = path.join(dir, file);
    const hex = await readHashId(fromDirectory);
    hashes.push({ name: file, hash: hex });
  }
  const duplicates = storeDuplicated(hashes);
  if (duplicates.length === 0) process.exit();
  const retrieveList = compareHash(hashes, duplicates);
  transferDuplicated(retrieveList, dir, path.join(dir, "duplicates"));
  viewInFolder(path.join(dir, "duplicates"));
  on.close();
};

run();
