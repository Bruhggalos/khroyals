/**
 * Gives the Android release build more memory. Expo's template allows Gradle
 * 2 GB, and with the location, background-task and image modules the release
 * build ran out ("Java heap space") on GitHub's runners, which have 16 GB.
 */
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

/** Set org.gradle.jvmargs in gradle.properties items, replacing the template's value. */
function setJvmArgs(items) {
  const existing = items.find((i) => i.type === 'property' && i.key === 'org.gradle.jvmargs');
  if (existing) existing.value = JVM_ARGS;
  else items.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
  return items;
}

const withGradleMemory = (config) => withGradleProperties(config, (c) => {
  c.modResults = setJvmArgs(c.modResults);
  return c;
});

module.exports = withGradleMemory;
module.exports.setJvmArgs = setJvmArgs;
module.exports.JVM_ARGS = JVM_ARGS;
