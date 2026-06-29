type PreReleaseType = "dev" | "alpha" | "beta" | "rc" | "stable" | null;

interface GodotVersionParts {
  major: number;
  minor: number;
  patch: number;
  prerelease: PreReleaseType;
  prereleaseNum: number | null;
  meta: string;
}

export class GodotVersion implements GodotVersionParts {
  major: number;
  minor: number;
  patch: number;
  prerelease: PreReleaseType;
  prereleaseNum: number | null;
  meta: string;

  private static rank: Record<NonNullable<PreReleaseType>, number> = {
    dev: 0,
    alpha: 1,
    beta: 2,
    rc: 3,
    stable: 4,
  };

  constructor(parts: GodotVersionParts) {
    this.major = parts.major;
    this.minor = parts.minor;
    this.patch = parts.patch;
    this.prerelease = parts.prerelease;
    this.prereleaseNum = parts.prereleaseNum;
    this.meta = parts.meta;
  }

  static fromParts(parts: GodotVersionParts): GodotVersion {
    return new GodotVersion(parts);
  }

  static fromNumbers(
    major: number,
    minor: number,
    patch: number,
    prerelease: PreReleaseType = null,
    prereleaseNum: number | null = null,
    meta = ""
  ): GodotVersion {
    return new GodotVersion({major, minor, patch, prerelease, prereleaseNum, meta});
  }

  static parse(input: string): GodotVersion | undefined {
    const [core, extra] = input.trim().split("-");

    const [major, minor, patch = 0] = core.split(".").map(n => Number(n));

    if (!Number.isFinite(major) || !Number.isFinite(minor)) {
      return undefined;
    }

    let prerelease: PreReleaseType = null;
    let prereleaseNum: number | null = null;
    let meta = "";

    if (extra) {
      const [tag, metaPart] = extra.split(".");
      meta = metaPart ?? "";

      const match = tag.match(/^([a-z]+)(\d*)$/i);

      if (match) {
        const type = match[1].toLowerCase();

        if (type === "dev" || type === "alpha" || type === "beta" || type === "rc" || type === "stable") {
          prerelease = type;
        }

        if (match[2]) {
          prereleaseNum = Number(match[2]);
        }
      }
    }

    return new GodotVersion({
      major,
      minor,
      patch,
      prerelease,
      prereleaseNum,
      meta,
    });
  }

  toString(): string {
    // let out = `${this.major}.${this.minor}.${this.patch}`; // semver-like
    let out = `${this.major}.${this.minor}`;
    if (this.patch !== 0) {
      out += `.${this.patch}`;
    }

    if (this.prerelease) {
      out += `-${this.prerelease}`;
      if (this.prereleaseNum !== null) out += this.prereleaseNum;
    }

    if (this.meta) {
      out += `.${this.meta}`;
    }

    return out;
  }

  compare(other: GodotVersion): number {
    if (this.major !== other.major) return this.major - other.major;
    if (this.minor !== other.minor) return this.minor - other.minor;
    if (this.patch !== other.patch) return this.patch - other.patch;

    const aRank = this.prerelease ? GodotVersion.rank[this.prerelease] : 999;
    const bRank = other.prerelease ? GodotVersion.rank[other.prerelease] : 999;

    if (aRank !== bRank) return aRank - bRank;

    return (this.prereleaseNum ?? 0) - (other.prereleaseNum ?? 0);
  }
}