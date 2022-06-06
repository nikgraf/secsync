#!/bin/bash

sha512sumfile=`ls -1 libsodium-*.tar.gz.sha512sum`
srcfile=`basename $sha512sumfile .sha512sum`
srcdir=`basename $srcfile .tar.gz`

# --------------------------
# Download and verify source
# --------------------------
[ -f $srcfile ] && rm -f $srcfile
curl -O https://download.libsodium.org/libsodium/releases/$srcfile
shasum -a 512 -c "$sha512sumfile" || exit 1

# --------------------------
# Extract sources
# --------------------------
[ -e $srcdir ] && rm -Rf $srcdir
tar -xzf $srcfile
cd $srcdir

targetPlatforms="$@"
[ "$targetPlatforms" ] || targetPlatforms="arm x86 ios"

for targetPlatform in $targetPlatforms
do
  # --------------------------
  # iOS build
  # --------------------------
  platform=`uname`
  if [ "$platform" == 'Darwin' ] && [ "$targetPlatform" == 'ios' ]; then
    IOS_VERSION_MIN=6.0 dist-build/ios.sh
  fi

  # --------------------------
  # Android build
  # --------------------------
  case $targetPlatform in
    "arm-old")
      dist-build/android-arm.sh
      ;;
    "arm")
      dist-build/android-armv7-a.sh
      dist-build/android-armv8-a.sh
      ;;
    "mips")
      dist-build/android-mips32.sh
      dist-build/android-mips64.sh
      ;;
    "x86")
      dist-build/android-x86.sh
      dist-build/android-x86_64.sh
    ;;
  esac

done
cd ..


# --------------------------
# Move compiled libraries
# --------------------------
mkdir -p libsodium
rm -Rf libsodium/*

for dir in $srcdir/libsodium-android-*
do
  mv $dir libsodium/
done

if [ "$platform" == 'Darwin' ] && [ -e $srcdir/libsodium-ios ]; then
  mv $srcdir/libsodium-ios libsodium/
fi


# --------------------------
# Cleanup
# --------------------------
[ -e $srcdir ] && rm -Rf $srcdir
[ -e $srcfile ] && rm $srcfile
