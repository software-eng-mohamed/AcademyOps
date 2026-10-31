const deniedLicense = /(^|[^A-Za-z0-9])A?GPL-3\.0(?:-only|-or-later|\+)?(?=$|[^A-Za-z0-9])/;

export function deniedProductionPackages(report) {
  return Object.entries(report).flatMap(([license, value]) => {
    if (!deniedLicense.test(license)) return [];
    const packages = Array.isArray(value) ? value : [value];
    return packages.map((entry) => ({
      license,
      name: typeof entry?.name === 'string' ? entry.name : 'unknown-package',
      versions: Array.isArray(entry?.versions) ? entry.versions.map(String) : [],
    }));
  });
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const denied = deniedProductionPackages(JSON.parse(input));
  if (!denied.length) {
    process.stdout.write('No denied GPL-3.0/AGPL-3.0 production licenses.\n');
    return;
  }

  for (const entry of denied) {
    const version = entry.versions.length ? `@${entry.versions.join(',')}` : '';
    process.stderr.write(`Denied production license: ${entry.name}${version} (${entry.license})\n`);
  }
  process.exitCode = 1;
}

await main();
