//
//  RCTSodium.m
//  RCTSodium
//
//  Created by Lyubomir Ivanov on 9/25/16.
//  Copyright © 2016 Lyubomir Ivanov. All rights reserved.
//
#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import "sodium.h"

#import "RCTSodium.h"

@implementation RCTSodium

static bool isInitialized;

NSString * const ESODIUM = @"ESODIUM";
NSString * const ERR_BAD_KEY = @"BAD_KEY";
NSString * const ERR_BAD_MAC = @"BAD_MAC";
NSString * const ERR_BAD_MSG = @"BAD_MSG";
NSString * const ERR_BAD_NONCE = @"BAD_NONCE";
NSString * const ERR_BAD_SEED = @"BAD_SEED";
NSString * const ERR_BAD_SIG = @"BAD_SIG";
NSString * const ERR_FAILURE = @"FAILURE";

RCT_EXPORT_MODULE();

+ (void) initialize
{
    [super initialize];
    isInitialized = sodium_init() != -1;
}


// *****************************************************************************
// * Sodium constants
// *****************************************************************************
- (NSDictionary *)constantsToExport
{
  return @{
    @"crypto_secretbox_KEYBYTES": @ crypto_secretbox_KEYBYTES,
    @"crypto_secretbox_NONCEBYTES": @ crypto_secretbox_NONCEBYTES,
    @"crypto_secretbox_MACBYTES": @ crypto_secretbox_MACBYTES,
    @"crypto_auth_KEYBYTES": @crypto_auth_KEYBYTES,
    @"crypto_auth_BYTES": @crypto_auth_BYTES,
    @"crypto_box_PUBLICKEYBYTES": @crypto_box_PUBLICKEYBYTES,
    @"crypto_box_SECRETKEYBYTES": @crypto_box_SECRETKEYBYTES,
    @"crypto_box_BEFORENMBYTES": @crypto_box_BEFORENMBYTES,
    @"crypto_box_SEEDBYTES": @crypto_box_SEEDBYTES,
    @"crypto_box_NONCEBYTES": @crypto_box_NONCEBYTES,
    @"crypto_box_MACBYTES": @crypto_box_MACBYTES,
    @"crypto_box_ZEROBYTES": @crypto_box_ZEROBYTES,
    @"crypto_box_BOXZEROBYTES": @crypto_box_BOXZEROBYTES,
    @"crypto_box_SEALBYTES": @crypto_box_SEALBYTES,
    @"crypto_sign_PUBLICKEYBYTES": @crypto_sign_PUBLICKEYBYTES,
    @"crypto_sign_SECRETKEYBYTES": @crypto_sign_SECRETKEYBYTES,
    @"crypto_sign_SEEDBYTES": @crypto_sign_SEEDBYTES,
    @"crypto_sign_BYTES": @crypto_sign_BYTES,
    @"crypto_pwhash_SALTBYTES": @crypto_pwhash_SALTBYTES,
    @"crypto_pwhash_OPSLIMIT_MODERATE":@crypto_pwhash_OPSLIMIT_MODERATE,
    @"crypto_pwhash_OPSLIMIT_MIN":@crypto_pwhash_OPSLIMIT_MIN,
    @"crypto_pwhash_OPSLIMIT_MAX":@crypto_pwhash_OPSLIMIT_MAX,
    @"crypto_pwhash_MEMLIMIT_MODERATE":@crypto_pwhash_MEMLIMIT_MODERATE,
    @"crypto_pwhash_MEMLIMIT_MIN":@crypto_pwhash_MEMLIMIT_MIN,
    @"crypto_pwhash_MEMLIMIT_MAX":@crypto_pwhash_MEMLIMIT_MAX,
    @"crypto_pwhash_ALG_DEFAULT":@crypto_pwhash_ALG_DEFAULT,
    @"crypto_pwhash_ALG_ARGON2I13":@crypto_pwhash_ALG_ARGON2I13,
    @"crypto_pwhash_ALG_ARGON2ID13":@crypto_pwhash_ALG_ARGON2ID13,
    @"crypto_scalarmult_BYTES":@crypto_scalarmult_BYTES,
    @"crypto_scalarmult_SCALARBYTES":@crypto_scalarmult_SCALARBYTES,
    @"crypto_aead_xchacha20poly1305_ietf_KEYBYTES": @ crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    @"crypto_aead_xchacha20poly1305_ietf_NPUBBYTES": @ crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    @"crypto_aead_xchacha20poly1305_ietf_ABYTES": @ crypto_aead_xchacha20poly1305_ietf_ABYTES,
  };

}

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

// *****************************************************************************
// * Sodium-specific functions
// *****************************************************************************
RCT_EXPORT_METHOD(sodium_version_string:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject)
{
  resolve(@(sodium_version_string()));
}


// *****************************************************************************
// * Random data generation
// *****************************************************************************
RCT_EXPORT_METHOD(randombytes_random:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject)
{
  resolve(@(randombytes_random()));
}

RCT_EXPORT_METHOD(randombytes_uniform:(NSUInteger)upper_bound resolve:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject)
{
  resolve(@(randombytes_uniform((uint32_t)upper_bound)));
}

RCT_EXPORT_METHOD(randombytes_buf:(NSUInteger)size resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char *buf = (unsigned char *) sodium_malloc((u_int32_t)size);
  if (buf == NULL)
    reject(ESODIUM,ERR_FAILURE,nil);
  else {
    randombytes_buf(buf,(u_int32_t)size);
    resolve([[NSData dataWithBytesNoCopy:buf length:size freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
    sodium_free(buf);
  }
}

RCT_EXPORT_METHOD(randombytes_close:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  int result = randombytes_close();
  if (result == 0) resolve(0); else reject(ESODIUM,ERR_FAILURE,nil);
}

RCT_EXPORT_METHOD(randombytes_stir:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject)
{
  randombytes_stir();
  resolve(0);
}


// *****************************************************************************
// * Secret-key cryptography - authenticated encryption
// *****************************************************************************
RCT_EXPORT_METHOD(crypto_secretbox_keygen:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char key[crypto_secretbox_KEYBYTES];
  crypto_secretbox_keygen(key);
  resolve([[NSData dataWithBytesNoCopy:key length:sizeof(key) freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_secretbox_easy:(NSString*)m n:(NSString*)n k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dm = [[NSData alloc] initWithBase64EncodedString:m options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dm || !dn || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_secretbox_KEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_secretbox_NONCEBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else {
    unsigned long clen = crypto_secretbox_MACBYTES + dm.length;
    unsigned char *dc = (unsigned char *) sodium_malloc(clen);
    if (dc == NULL) reject(ESODIUM,ERR_FAILURE,nil);
    else {
      int result = crypto_secretbox_easy(dc,[dm bytes], dm.length, [dn bytes], [dk bytes]);
      if (result != 0)
        reject(ESODIUM,ERR_FAILURE,nil);
      else
        resolve([[NSData dataWithBytesNoCopy:dc length:clen freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
      sodium_free(dc);
    }
  }
}


RCT_EXPORT_METHOD(crypto_secretbox_open_easy:(NSString*)c n:(NSString*)n k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dc = [[NSData alloc] initWithBase64EncodedString:c options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dc || !dn || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_secretbox_KEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_secretbox_NONCEBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else if (crypto_secretbox_open_easy([dc bytes], [dc bytes], dc.length, [dn bytes], [dk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:[dc bytes] length:dc.length - crypto_secretbox_MACBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
}

// ***************************************************************************
// * Secret-key cryptography - authentication
// ***************************************************************************
RCT_EXPORT_METHOD(crypto_auth_keygen:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char key[crypto_auth_KEYBYTES];
  crypto_auth_keygen(key);
  resolve([[NSData dataWithBytesNoCopy:key length:sizeof(key) freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_auth:(NSString*)in k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char out[crypto_auth_BYTES];

  const NSData *din = [[NSData alloc] initWithBase64EncodedString:in options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!din || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_auth_KEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else {
    crypto_auth(out, [din bytes], (unsigned long long) din.length, [dk bytes]);
    resolve([[NSData dataWithBytesNoCopy:out length:sizeof(out) freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
  }
}

RCT_EXPORT_METHOD(crypto_auth_verify:(NSString*)h in:(NSString*)in k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dh = [[NSData alloc] initWithBase64EncodedString:h options:0];
  const NSData *din = [[NSData alloc] initWithBase64EncodedString:in options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dh || !din || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_auth_KEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dh.length != crypto_auth_BYTES) reject(ESODIUM,ERR_BAD_MAC,nil);
  else {
    int result = crypto_auth_verify([dh bytes], [din bytes], (unsigned long long) din.length, [dk bytes]);
    resolve(@(result));
  }
}

// *****************************************************************************
// * Public-key cryptography - authenticated encryption
// *****************************************************************************
RCT_EXPORT_METHOD(crypto_box_keypair:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char pk[crypto_box_PUBLICKEYBYTES],sk[crypto_box_SECRETKEYBYTES];
  if ( crypto_box_keypair(pk,sk) == 0) {
    NSString *pk64 = [[NSData dataWithBytesNoCopy:pk length:sizeof(pk) freeWhenDone:NO]  base64EncodedStringWithOptions:0];
    NSString *sk64 = [[NSData dataWithBytesNoCopy:sk length:sizeof(sk) freeWhenDone:NO]  base64EncodedStringWithOptions:0];
    if (!pk64 || !sk64) reject(ESODIUM,ERR_FAILURE,nil); else resolve(@{@"pk":pk64, @"sk":sk64});
  }
  else
    reject(ESODIUM,ERR_FAILURE,nil);
}

RCT_EXPORT_METHOD(crypto_box_easy:(NSString*)m n:(NSString*)n pk:(NSString*)pk sk:(NSString*)sk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dm = [[NSData alloc] initWithBase64EncodedString:m options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dpk = [[NSData alloc] initWithBase64EncodedString:pk options:0];
  const NSData *dsk = [[NSData alloc] initWithBase64EncodedString:sk options:0];
  if (!dm || !dn || !dpk || !dsk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dpk.length != crypto_box_PUBLICKEYBYTES || dsk.length != crypto_box_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_box_NONCEBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else {
    unsigned long clen = crypto_box_MACBYTES + dm.length;
    unsigned char *dc = (unsigned char *) sodium_malloc(clen);
    if (dc == NULL) reject(ESODIUM,ERR_FAILURE,nil);
    else {
      int result = crypto_box_easy(dc,[dm bytes], dm.length, [dn bytes], [dpk bytes], [dsk bytes]);
      if (result != 0)
        reject(ESODIUM,ERR_FAILURE,nil);
      else
        resolve([[NSData dataWithBytesNoCopy:dc length:clen freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
      sodium_free(dc);
    }
  }
}

RCT_EXPORT_METHOD(crypto_box_easy_afternm:(NSString*)m n:(NSString*)n k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dm = [[NSData alloc] initWithBase64EncodedString:m options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dm || !dn || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_box_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_box_NONCEBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else {
    unsigned long clen = crypto_box_MACBYTES + dm.length;
    unsigned char *dc = (unsigned char *) sodium_malloc(clen);
    if (dc == NULL) reject(ESODIUM,ERR_FAILURE,nil);
    else {
      int result = crypto_box_easy_afternm(dc, [dm bytes], dm.length, [dn bytes], [dk bytes]);
      if (result != 0)
        reject(ESODIUM,ERR_FAILURE,nil);
      else
        resolve([[NSData dataWithBytesNoCopy:dc length:clen freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
      sodium_free(dc);
    }
  }
}

RCT_EXPORT_METHOD(crypto_box_open_easy:(NSString*)c n:(NSString*)n pk:(NSString*)pk sk:(NSString*)sk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dc = [[NSData alloc] initWithBase64EncodedString:c options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dpk = [[NSData alloc] initWithBase64EncodedString:pk options:0];
  const NSData *dsk = [[NSData alloc] initWithBase64EncodedString:sk options:0];
  if (!dc || !dn || !dpk || !dsk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dpk.length != crypto_box_PUBLICKEYBYTES || dsk.length != crypto_box_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_box_NONCEBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else if (crypto_box_open_easy([dc bytes], [dc bytes], dc.length, [dn bytes], [dpk bytes], [dsk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:[dc bytes] length:dc.length - crypto_box_MACBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_box_open_easy_afternm:(NSString*)c n:(NSString*)n k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dc = [[NSData alloc] initWithBase64EncodedString:c options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dc || !dn || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_box_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_box_NONCEBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else if (crypto_box_open_easy_afternm([dc bytes], [dc bytes], dc.length, [dn bytes], [dk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:[dc bytes] length:dc.length - crypto_box_MACBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_box_beforenm:(NSString*)pk sk:(NSString*)sk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dpk = [[NSData alloc] initWithBase64EncodedString:pk options:0];
  const NSData *dsk = [[NSData alloc] initWithBase64EncodedString:sk options:0];

  unsigned char *dshared = (unsigned char *) sodium_malloc(crypto_box_PUBLICKEYBYTES);
  if (!dpk || !dsk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dpk.length != crypto_box_PUBLICKEYBYTES || dsk.length != crypto_box_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_box_beforenm(dshared, [dpk bytes], [dsk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:dshared length:crypto_box_SECRETKEYBYTES freeWhenDone:NO] base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_box_seal:(NSString*)m pk:(NSString*)pk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dm = [[NSData alloc] initWithBase64EncodedString:m options:0];
  const NSData *dpk = [[NSData alloc] initWithBase64EncodedString:pk options:0];
  unsigned long cipher_len = crypto_box_SEALBYTES + dm.length;
  unsigned char *dc = (unsigned char *) sodium_malloc(cipher_len);
  if (!dm || !dc) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dpk.length != crypto_sign_PUBLICKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_box_seal(dc, [dm bytes], dm.length, [dpk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:dc length:cipher_len freeWhenDone:NO] base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_pwhash:(nonnull NSNumber*)keylen password:(NSString*)password salt:(NSString*)salt opslimit:(nonnull NSNumber*)opslimit memlimit:(nonnull NSNumber*)memlimit algo:(nonnull NSNumber*)algo resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    const NSData *dpassword = [[NSData alloc] initWithBase64EncodedString:password options:0];
    const NSData *dsalt = [[NSData alloc] initWithBase64EncodedString:salt options:0];
    unsigned long long key_len = [keylen unsignedLongLongValue];
    unsigned char *key = (unsigned char *) sodium_malloc(key_len);

    if (crypto_pwhash(key, key_len,
                      [dpassword bytes],
                      [dpassword length],
                      [dsalt bytes],
                      [opslimit unsignedLongLongValue],
                      [memlimit unsignedLongValue], [algo intValue]) != 0)
        reject(ESODIUM, ERR_FAILURE, nil);
    else
        resolve([[NSData dataWithBytesNoCopy:key length:key_len freeWhenDone:NO] base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_box_seal_open:(NSString*)c pk:(NSString*)pk sk:(NSString*)sk resolve: (RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dc = [[NSData alloc] initWithBase64EncodedString:c options:0];
  const NSData *dpk = [[NSData alloc] initWithBase64EncodedString:pk options:0];
  const NSData *dsk = [[NSData alloc] initWithBase64EncodedString:sk options:0];
  unsigned long cipher_len = dc.length - crypto_box_SEALBYTES;
  unsigned char *dm = (unsigned char *) sodium_malloc(cipher_len);
  if (!dc || !dpk || !dsk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dpk.length != crypto_box_PUBLICKEYBYTES || dsk.length != crypto_box_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_box_seal_open(dm, [dc bytes], dc.length, [dpk bytes], [dsk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:dm length:cipher_len freeWhenDone:NO] base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_scalarmult_base:(NSString*)n resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  unsigned char q[crypto_scalarmult_BYTES];
  if (!dn || dn.length != crypto_scalarmult_SCALARBYTES)
    reject(ESODIUM, ERR_BAD_KEY, nil);
  else if (crypto_scalarmult_base(q, [dn bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE, nil);
  else
    resolve([[NSData dataWithBytesNoCopy:q length:sizeof(q) freeWhenDone:NO] base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_scalarmult:(NSString*)n p:(NSString*)p resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dp = [[NSData alloc] initWithBase64EncodedString:p options:0];
  unsigned char q[crypto_scalarmult_BYTES];
  if (!dn || !dp || dn.length != crypto_scalarmult_SCALARBYTES || dp.length != crypto_scalarmult_BYTES)
    reject(ESODIUM, ERR_BAD_KEY, nil);
  else if (crypto_scalarmult(q, [dn bytes], [dp bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE, nil);
  else
    resolve([[NSData dataWithBytesNoCopy:q length:sizeof(q) freeWhenDone:NO] base64EncodedStringWithOptions:0]);
}

// *****************************************************************************
// * Public-key cryptography - signatures
// *****************************************************************************

RCT_EXPORT_METHOD(crypto_sign_detached:(NSString*)msg sk:(NSString*)sk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dmsg = [[NSData alloc] initWithBase64EncodedString:msg options:0];
  const NSData *dsk  = [[NSData alloc] initWithBase64EncodedString:sk options:0];
  unsigned char *dsig = (unsigned char *) sodium_malloc(crypto_sign_BYTES);
  if (!dsig || !dmsg || !dsk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dsk.length != crypto_sign_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_sign_detached(dsig, nil, [dmsg bytes], dmsg.length, [dsk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve([[NSData dataWithBytesNoCopy:dsig length:crypto_sign_SECRETKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
  sodium_free(dsig);
}

RCT_EXPORT_METHOD(crypto_sign_verify_detached:(NSString*)sig msg:(NSString*)msg pk:(NSString*)pk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dmsg = [[NSData alloc] initWithBase64EncodedString:msg options:0];
  const NSData *dpk  = [[NSData alloc] initWithBase64EncodedString:pk options:0];
  const NSData *dsig = [[NSData alloc] initWithBase64EncodedString:sig options:0];
  if (!dsig || !dmsg || !dpk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dpk.length != crypto_sign_PUBLICKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dsig.length != crypto_sign_BYTES) reject(ESODIUM,ERR_BAD_SIG,nil);
  else if (crypto_sign_verify_detached([dsig bytes], [dmsg bytes], dmsg.length, [dpk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else
    resolve(@(TRUE));
}

RCT_EXPORT_METHOD(crypto_sign_keypair:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char *sk = (unsigned char *) sodium_malloc(crypto_sign_SECRETKEYBYTES);
  unsigned char *pk = (unsigned char *) sodium_malloc(crypto_sign_PUBLICKEYBYTES);
  if (!sk || !pk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (crypto_sign_keypair(pk, sk) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else {
    NSString *pk64 = [[NSData dataWithBytesNoCopy:pk length:crypto_sign_PUBLICKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0];
    NSString *sk64 = [[NSData dataWithBytesNoCopy:sk length:crypto_sign_SECRETKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0];
    resolve(@{@"sk": sk64, @"pk": pk64});
  }
}

RCT_EXPORT_METHOD(crypto_sign_seed_keypair:(NSString*)seed resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dseed = [[NSData alloc] initWithBase64EncodedString:seed options:0];
  unsigned char *sk = (unsigned char *) sodium_malloc(crypto_sign_SECRETKEYBYTES);
  unsigned char *pk = (unsigned char *) sodium_malloc(crypto_sign_PUBLICKEYBYTES);
  if (!dseed || !sk || !pk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dseed.length != crypto_sign_SEEDBYTES) reject(ESODIUM,ERR_BAD_SEED,nil);
  else if (crypto_sign_seed_keypair(pk, sk, [dseed bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else {
    NSString *pk64 = [[NSData dataWithBytesNoCopy:pk length:crypto_sign_PUBLICKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0];
    NSString *sk64 = [[NSData dataWithBytesNoCopy:sk length:crypto_sign_SECRETKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0];
    resolve(@{@"sk": sk64, @"pk": pk64});
  }
}

RCT_EXPORT_METHOD(crypto_sign_ed25519_sk_to_seed:(NSString*)sk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dsk = [[NSData alloc] initWithBase64EncodedString:sk options:0];
  unsigned char *seed = (unsigned char *) sodium_malloc(crypto_sign_SEEDBYTES);
  if (!seed || !dsk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dsk.length != crypto_sign_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_sign_ed25519_sk_to_seed(seed, [dsk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else {
    resolve([[NSData dataWithBytesNoCopy:seed length:crypto_sign_SEEDBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
  }
}

RCT_EXPORT_METHOD(crypto_sign_ed25519_pk_to_curve25519:(NSString*)ed_pk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *ded_pk = [[NSData alloc] initWithBase64EncodedString:ed_pk options:0];
  unsigned char *curve_pk = (unsigned char *) sodium_malloc(crypto_sign_PUBLICKEYBYTES);
  if (!ded_pk || !curve_pk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (ded_pk.length != crypto_sign_PUBLICKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_sign_ed25519_pk_to_curve25519(curve_pk, [ded_pk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else {
    resolve([[NSData dataWithBytesNoCopy:curve_pk length:crypto_sign_PUBLICKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
  }
}

RCT_EXPORT_METHOD(crypto_sign_ed25519_sk_to_curve25519:(NSString*)ed_sk resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *ded_sk = [[NSData alloc] initWithBase64EncodedString:ed_sk options:0];
  unsigned char *curve_sk = (unsigned char *) sodium_malloc(crypto_box_SECRETKEYBYTES);
  if (!ded_sk || !curve_sk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (ded_sk.length != crypto_sign_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_sign_ed25519_sk_to_curve25519(curve_sk, [ded_sk bytes]) != 0)
    reject(ESODIUM,ERR_FAILURE,nil);
  else {
    resolve([[NSData dataWithBytesNoCopy:curve_sk length:crypto_box_SECRETKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
  }
}

RCT_EXPORT_METHOD(crypto_sign_ed25519_sk_to_pk:(NSString*)sk resolve: (RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dsk = [[NSData alloc] initWithBase64EncodedString:sk options:0];
  unsigned char *pk = (unsigned char *) sodium_malloc(crypto_sign_PUBLICKEYBYTES);
  if (!dsk || !pk) reject(ESODIUM, ERR_FAILURE, nil);
  if (dsk.length != crypto_sign_SECRETKEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (crypto_sign_ed25519_sk_to_pk(pk, [dsk bytes]) != 0)
    reject(ESODIUM, ERR_FAILURE, nil);
  else {
    resolve([[NSData dataWithBytesNoCopy:pk length:crypto_sign_PUBLICKEYBYTES freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
  }
}

// *****************************************************************************
// * Secret-key cryptography - AEAD constructions
// *****************************************************************************
RCT_EXPORT_METHOD(crypto_aead_xchacha20poly1305_ietf_keygen:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned char key[crypto_aead_xchacha20poly1305_ietf_KEYBYTES];
  crypto_aead_xchacha20poly1305_ietf_keygen(key);
  resolve([[NSData dataWithBytesNoCopy:key length:sizeof(key) freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(crypto_aead_xchacha20poly1305_ietf_encrypt:(NSString*)m d:(NSString*)d n:(NSString*)n k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dm = [[NSData alloc] initWithBase64EncodedString:m options:0];
  const NSData *dd = [[NSData alloc] initWithBase64EncodedString:d options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dm || !dd || !dn || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_aead_xchacha20poly1305_ietf_KEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else {
    unsigned long clen = crypto_aead_xchacha20poly1305_ietf_ABYTES + dm.length;
    unsigned char *dc = (unsigned char *) sodium_malloc(clen);
    unsigned long long ciphertext_len;
    if (dc == NULL) reject(ESODIUM,ERR_FAILURE,nil);
    else {
      int result = crypto_aead_xchacha20poly1305_ietf_encrypt(dc, &ciphertext_len,[dm bytes], dm.length, [dd bytes], dd.length, NULL, [dn bytes], [dk bytes]);
      if (result != 0)
        reject(ESODIUM,ERR_FAILURE,nil);
      else
        resolve([[NSData dataWithBytesNoCopy:dc length:ciphertext_len freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
      sodium_free(dc);
    }
  }
}

RCT_EXPORT_METHOD(crypto_aead_xchacha20poly1305_ietf_decrypt:(NSString*)c d:(NSString*)d n:(NSString*)n k:(NSString*)k resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  const NSData *dc = [[NSData alloc] initWithBase64EncodedString:c options:0];
  const NSData *dd = [[NSData alloc] initWithBase64EncodedString:d options:0];
  const NSData *dn = [[NSData alloc] initWithBase64EncodedString:n options:0];
  const NSData *dk = [[NSData alloc] initWithBase64EncodedString:k options:0];
  if (!dc || !dd || !dn || !dk) reject(ESODIUM,ERR_FAILURE,nil);
  else if (dk.length != crypto_aead_xchacha20poly1305_ietf_KEYBYTES) reject(ESODIUM,ERR_BAD_KEY,nil);
  else if (dn.length != crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) reject(ESODIUM,ERR_BAD_NONCE,nil);
  else {
    unsigned long mlen = dc.length;
    unsigned char *dm = (unsigned char *) sodium_malloc(mlen);
    unsigned long long message_len;
    if (crypto_aead_xchacha20poly1305_ietf_decrypt(dm, &message_len, NULL, [dc bytes], dc.length, [dd bytes], dd.length, [dn bytes], [dk bytes]) != 0)
      reject(ESODIUM,ERR_FAILURE,nil);
    else
      resolve([[NSData dataWithBytesNoCopy:dm length:message_len freeWhenDone:NO]  base64EncodedStringWithOptions:0]);
    sodium_free(dm);
  }
}


@end
