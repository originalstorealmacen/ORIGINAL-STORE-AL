// Switch only after validating the Original Store server and its private configuration.
window.ORIGINAL_STORE_BACKEND=Object.freeze({provider:'apps-script',appsScript:'https://script.google.com/macros/s/AKfycbyJPGQXLqyFAlAtO7vEih7yZzRuevROj6dcb-AQF02PupM66BGeLbMULKV-bW5LrfoW/exec',supabase:'https://zhtrwvbmkxxfxvdhgngs.supabase.co/functions/v1/original-store-api'});
window.ORIGINAL_STORE_API_URL=window.ORIGINAL_STORE_BACKEND.provider==='supabase'?window.ORIGINAL_STORE_BACKEND.supabase:window.ORIGINAL_STORE_BACKEND.appsScript;
