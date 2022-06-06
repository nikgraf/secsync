cmake_minimum_required(VERSION 3.4.1)

set(ARCH_DIR ${ANDROID_ARCH_NAME})

if( ANDROID_ABI STREQUAL "armeabi-v7a")
  set( ARCH_DIR "armv7-a" )
elseif ( ANDROID_ABI STREQUAL "arm64-v8a")
  set( ARCH_DIR "armv8-a" )
elseif ( ANDROID_ABI STREQUAL "x86")
  set ( ARCH_DIR "i686" )
elseif ( ANDROID_ABI STREQUAL "x86_64")
  set ( ARCH_DIR "westmere" )
endif()


add_library(sodium SHARED IMPORTED)
include_directories( ${PROJECT_SOURCE_DIR}/../libsodium/libsodium-android-${ARCH_DIR}/include/ )
set_target_properties( sodium PROPERTIES IMPORTED_LOCATION ${PROJECT_SOURCE_DIR}/../libsodium/libsodium-android-${ARCH_DIR}/lib/libsodium.so )
file(COPY ${PROJECT_SOURCE_DIR}/../libsodium/libsodium-android-${ARCH_DIR}/lib/libsodium.so DESTINATION "${PROJECT_SOURCE_DIR}/lib/${ANDROID_ABI}")

add_library(sodium-jni SHARED src/main/cpp/sodium-jni.c)
target_link_libraries(sodium-jni sodium)
