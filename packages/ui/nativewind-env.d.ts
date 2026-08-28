/**
 * Teaches TypeScript that React Native components accept `className`.
 *
 * NativeWind adds the prop at runtime via its Babel transform, but the RN types know
 * nothing about it. Without this reference every styled component in the package is a
 * type error, which is why the app carries the same file.
 */
/// <reference types="nativewind/types" />
