export type DependencyLanguage = "node" | "python";

export interface ImportReference {
  specifier: string;
  packageName: string;
  raw: string;
  language: DependencyLanguage;
}

export interface DependencyManifest {
  kind: "package_json" | "requirements_txt" | "pyproject_toml";
  path: string;
  packageNames: Set<string>;
}

export interface MissingDependency {
  specifier: string;
  packageName: string;
  language: DependencyLanguage;
  sourceFile: string;
  manifestPath: string | null;
}
