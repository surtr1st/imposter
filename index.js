const readline = require("readline");
const process = require("process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs").promises;
const { Transform } = require("stream");
const { createReadStream } = require("fs");
const { spawn } = require("child_process");

const on = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const readDirectory = async (dir) => {
  try {
    console.log("-> Reading File...");
    console.time("[Done Reading]: ");
    const files = await fs.readdir(dir, { withFileTypes: false });
    console.timeEnd("[Done Reading]: ");

    console.log(`[Total File]: ${files.length}`);
    console.log("\n");

    console.log("-> Filtering File... ");
    console.time("[Done Filtering]");
    const filteredFiles = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        return stat.isFile() ? file : null;
      })
    );
    console.timeEnd("[Done Filtering]");
    console.log("\n");

    return filteredFiles.filter(Boolean);
  } catch (err) {
    console.error("Error reading directory", err);
  }
};

const readHash = (file) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const transform = new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk);
        callback();
      },
      flush(callback) {
        resolve(hash.digest("hex"));
        callback();
      },
    });
    createReadStream(file).on("error", reject).pipe(transform);
  });
};

const storeDuplicated = (files) => {
  const set = new Set();
  console.log("-> Storing Duplicated Hash... ");
  console.time("[Done Storing]");
  const duplicates = files.filter((file) => {
    if (set.has(file.hash)) return true;
    else {
      set.add(file.hash);
      return false;
    }
  });
  console.timeEnd("[Done Storing]");
  console.log(`[Total Duplicated]: ${duplicates.length}`);
  console.log("\n");
  return duplicates;
};

const compareHash = (originalFileHashes, storedFileHashes) => {
  const set = new Set();
  console.log("-> Re-Storing Duplicated Hash... ");
  console.time("[Done Re-Storing]");
  for (const file of originalFileHashes) set.add(file.hash);
  console.timeEnd("[Done Re-Storing]");
  console.log("\n");

  console.log("-> Comparing Hash... ");
  console.time("[Done Comparing]");
  const files = storedFileHashes.filter((file) => set.has(file.hash));
  console.timeEnd("[Done Comparing]");

  console.table(files);
  console.log("\n");
  return files;
};

const transferDuplicated = async (files, origin, dest) => {
  try {
    console.log("-> Making directory... ");
    await fs.mkdir(dest, { recursive: true });

    console.log("-> Transfering... ");
    console.time("[Done Transfering]");
    const renamePromises = files.map((file) =>
      fs.rename(`${origin}/${file.name}`, `${dest}/${file.name}`)
    );
    await Promise.all(renamePromises);
    console.timeEnd("[Done Transfering]");

    console.log("\n");
  } catch (err) {
    console.error("Error transfering file to directory", err);
  }
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
  console.log("\n");

  const hashes = [];
  const files = await readDirectory(dir);

  console.log("-> Reading File Hash... ");
  console.time("[Done Reading]");
  for (const file of files) {
    if (file.startsWith(".")) continue;
    if (file.endsWith(".mp4")) continue;
    if (file.endsWith(".mkv")) continue;
    const filesFromDirectory = path.join(dir, file);
    hashes.push({
      name: file,
      hash: await readHash(filesFromDirectory)
    });
  }
  console.timeEnd("[Done Reading]");
  console.log("\n");

  const duplicates = storeDuplicated(hashes);
  if (duplicates.length === 0) process.exit();
  const retrieveList = compareHash(hashes, duplicates);
  transferDuplicated(retrieveList, dir, path.join(dir, "duplicates"));
  viewInFolder(path.join(dir, "duplicates"));
  on.close();
};

run();
