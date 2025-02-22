import { spawn } from "child_process";
import { cwd } from "process";
import { Readable, Writable } from "stream";

class CacheProcess {
  private rustProgramPath: string;
  private process:
    | import("child_process").ChildProcessByStdio<Writable, Readable, null>
    | null;
  private stdoutData: string;
  private level: "normal" | "debug";

  constructor(rustProgramPath: string, level: "normal" | "debug") {
    this.rustProgramPath = rustProgramPath;
    this.process = null;
    this.stdoutData = "";
    this.level = level;
  }

  start(): void {
    this.process = spawn(this.rustProgramPath, [], {
      stdio: ["pipe", "pipe", "ignore"], // 'ignore' hides stderr, change to 'pipe' to debug errors
    });

    if (this.process && this.process.stdout) {
      this.process.stdout.on("data", (chunk) => {
        this.stdoutData += chunk.toString();
        if (this.level === "debug") {
          console.log("STDOUT:", chunk.toString().trim());
        } // Debug output
      });
    }

    this.process?.on("error", (err) => console.error("Process error:", err));
  }

  async insert(
    key: string,
    value: string,
    expire_duration: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      if (this.process && this.process.stdin) {
        if (this.level === "debug") {
          console.log("DEBUG: Inserting key-value");
        }

        const cur_time = Math.floor(Date.now() / 1000);
        const cur_ts_b = Buffer.alloc(6);
        cur_ts_b.writeUIntBE(cur_time, 0, 6);

        const expire_duration_b = Buffer.alloc(2);
        expire_duration_b.writeUInt16BE(expire_duration, 0);

        const command = Buffer.from("I");
        const key_b = Buffer.alloc(63);
        key_b.write(key, 0, "ascii");
        const value_b = Buffer.alloc(56);
        value_b.write(value, 0, "ascii");
        const combinedBuffer = Buffer.concat(
          [command, key_b, value_b, cur_ts_b, expire_duration_b],
          128,
        );

        this.process.stdin.write(combinedBuffer);

        this.process.stdout.once("data", (data: Buffer) => {
          data.slice(0, 56).toString();
          resolve("I");
        });
      } else {
        if (this.level === "debug") {
          console.error("Rust program is not started.");
        }
        resolve("");
      }
    });
  }

  async get(key: string): Promise<string> {
    return new Promise((resolve) => {
      try {
        if (this.process && this.process.stdin) {
          if (this.level === "debug") {
            console.log("DEBUG: Getting value for key");
          }

          const command = Buffer.from("G");
          const key_b = Buffer.alloc(127);
          key_b.write(key, 0, "ascii");
          const combinedBuffer = Buffer.concat([command, key_b], 128);

          this.process.stdin.write(combinedBuffer);

          this.process.stdout.once("data", (data: Buffer) => {
            let outstr = data.slice(0, 56).toString();
            if (outstr === "G") {
              throw new Error("No longer exists");
            }
            resolve(outstr.replace("\n", ""));
          });
        } else {
          if (this.level === "debug") {
            console.error("Rust program is not started.");
          }
          resolve("");
        }
      } catch (e) {
        resolve("");
      }
    });
  }

  async remove(key: string): Promise<string> {
    return new Promise((resolve) => {
      try {
        if (this.process && this.process.stdin) {
          if (this.level === "debug") {
            console.log("DEBUG: Getting value for key");
          }

          const command = Buffer.from("R");
          const key_b = Buffer.alloc(127);
          key_b.write(key, 0, "ascii");
          const combinedBuffer = Buffer.concat([command, key_b], 128);

          this.process.stdin.write(combinedBuffer);

          this.process.stdout.once("data", (data: Buffer) => {
            let outstr = data.slice(0, 56).toString();
            resolve(outstr.replace("\n", ""));
          });
        } else {
          if (this.level === "debug") {
            console.error("Rust program is not started.");
          }
          resolve("");
        }
      } catch (e) {
        resolve("");
      }
    });
  }

  close(): void {
    if (this.process) {
      this.process.stdin.end();
      this.process.kill();
      if (this.level === "debug") {
        console.log("Rust program closed.");
      }
    } else {
      if (this.level === "debug") {
        console.error("Rust program is not started.");
      }
    }
  }
}

const rustProgramPath = cwd() + "/target/release/cacherebbok";
export const RustCache = new CacheProcess(rustProgramPath, "normal");
