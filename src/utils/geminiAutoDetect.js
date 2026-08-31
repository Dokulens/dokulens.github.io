/**
 * Self-contained Gemini watermark detection & removal engine
 * Alpha maps embedded from GargantuaX/gemini-watermark-remover
 */

const ALPHA_NOISE_FLOOR = 3 / 255
const ALPHA_THRESHOLD = 0.002
const MAX_ALPHA = 0.99
const LOGO_VALUE = 255
const EPSILON = 1e-10

// Embedded base64-encoded Float32Arrays from GargantuaX
const ALPHA_MAP_B64 = {
  48: 'gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAADj4uI+4eDgPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDvBwEA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4WEBD6BgAA/gYAAP4GAAD4AAAAAgYAAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8wcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYAAPIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO5GQkD6BgAA/gYAAP5GQkD4AAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADwAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAO+Hg4D6BgAA/gYAAP/Hw8D4AAAAAgYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPoGAAD+BgAA/gYAAP4GAAD+BgAA+AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAADwAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7AAAAAAAAAACBgIA7oaCgPoGAAD+BgAA/gYAAP4GAAD/BwMA+AAAAAAAAAACBgIA7AAAAAIGAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAwcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADwAAAAAAAAAAIGAADyJiIg9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgIA7AAAAAAAAAAAAAAAAgYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAADwAAAAAgYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO8HAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/o6KiPoGAgDuBgAA8AAAAAIGAgDuBgIA7gYCAO8HAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPAAAAAAAAAAAgYCAO4GAADyBgIA7gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAADyBgAA8gYCAO4mIiD2BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD6BgAA8gYCAO4GAADwAAAAAgYCAO4GAADyBgIA7wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7AAAAAIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO+Hg4D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDsAAAAAAAAAAIGAgDuBgAA8AAAAAIGAgDuBgIA7AAAAAAAAAAAAAAAAgYAAPIGAgDuBgIA7gYAAPAAAAACBgIA7gYCAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4GA+AAAAAAAAAACBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAACBgIA7gYCAO8HAQDwAAAAAgYCAO4GAADwAAAAAgYAAPAAAAACBgAA8gYCAOwAAAACBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+wcDAPYGAgDuBgAA8wcBAPIGAADyBgAA8gYAAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAACBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7AAAAAMHAQDyBgAA8gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAAD2BgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAOwAAAACBgIA7AAAAAAAAAACBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO9PS0j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPIGAgDuBgIA7o6KiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+hoKA+gYCAOwAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPgAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAADwAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPcHAwD6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgIA9gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgIA7gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAADBwMA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+iYiIPYGAgDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAOHgYD7x8PA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4WEhD6BgIA7gYCAO4GAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAgDsAAAAAgYAAPIGAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAgDuBgAA+wcDAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAPYGAADzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6GgoD6BgIA9gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4WEBD7BwMA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAAD6BgIA7gYAAPIGAgDuBgIA7AAAAAIGAAD6RkJA+8fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+kZCQPoGAAD6BgIA84eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAO4GAAD6RkJA+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+kZCQPoGAAD6BgIA7gYCAO8HAQDwAAAAAgYCAO4GAAD6hoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/wcDAPoGAAD6BgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA7AAAAAAAAAACBgAA8gYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6Oioj6JiIg9gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO4GAADyBgIA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/BwMA+gYAAPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/8/LyPuXkZD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAAAAAAAAAAAAgYAAPAAAAACBgIA94+LiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+wcDAPYGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPdHQ0D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA9gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgIA7gYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/oaCgPsHAQDzBwEA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7gYCAO4GAADyBgIA7oaCgPoGAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8PCwj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgAA8gYAAPMHAQDzBwEA8gYCAOwAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYCAO6GgID3j4uI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAgD2BgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYCAPMHAQDwAAAAAgYCAO8HAQDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8AAAAAAAAAACBgAA8wcBAPIGAADzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADzJyMg98fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgAA8wcBAPIGAADyBgIA7AAAAAAAAAACBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA84eBgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYCAO4GAgDvBwEA8gYAAPIGAgDsAAAAAgYCAO4GAgDvBwEA8wcBAPIGAgDuBgAA8gYCAOwAAAAAAAAAAAAAAAIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYAAPIGAADyBgAA8AAAAAMHAwD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgAA8gYCAO4GAAD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAgD2BgIA7gYCAOwAAAACBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAOwAAAACBgAA8gYAAPIGAADyBgIA7gYCAOwAAAAChoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPYGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAw8LCPoKBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDuBgIA7gYAAPMHAQDyBgIA7gYAAPoKBAT+BgAA/gYAAP4GAAD+BgAA+gYCAO4GAADyBgAA8AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPAAAAAAAAAAAgYAAPIGAADyBgIA7gYCAO/Py8j6BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAADzBwEA8gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO5OSkj6BgAA/gYAAP5OSkj6BgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADyBgIA7AAAAAIGAgDvBwEA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYAAPIGAAD6BgAA/gYAAP4WEBD6BgIA7gYCAO4GAADyBgAA8gYAAPIGAADwAAAAAgYCAOwAAAACBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8gYAAPIGAgDvh4OA+4eDgPoGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7',
  96: null
}

let _alphaCache = {}

function decodeAlphaMap(base64) {
  const raw = atob(base64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return new Float32Array(buf.buffer)
}

function getAlphaMap(size) {
  if (_alphaCache[size]) return _alphaCache[size]
  const b64 = ALPHA_MAP_B64[size]
  if (b64) {
    _alphaCache[size] = decodeAlphaMap(b64)
  } else {
    // Fallback: generate from 48 map by scaling
    const base = getAlphaMap(48)
    const map = new Float32Array(size * size)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const sr = (r / size) * 48
        const sc = (c / size) * 48
        const r0 = Math.min(47, Math.floor(sr))
        const c0 = Math.min(47, Math.floor(sc))
        const fr = sr - r0
        const fc = sc - c0
        const v00 = base[r0 * 48 + c0]
        const v01 = base[r0 * 48 + Math.min(47, c0 + 1)]
        const v10 = base[Math.min(47, r0 + 1) * 48 + c0]
        const v11 = base[Math.min(47, r0 + 1) * 48 + Math.min(47, c0 + 1)]
        map[r * size + c] = v00 * (1 - fr) * (1 - fc) + v01 * (1 - fr) * fc + v10 * fr * (1 - fc) + v11 * fr * fc
      }
    }
    _alphaCache[size] = map
  }
  return _alphaCache[size]
}

// --- NCC Template Matching Helpers ---

function toGrayscale(imageData, regionX, regionY, regionW, regionH, fullWidth) {
  const pixels = imageData.data
  const gray = new Float32Array(regionW * regionH)
  for (let r = 0; r < regionH; r++) {
    for (let c = 0; c < regionW; c++) {
      const idx = ((regionY + r) * fullWidth + (regionX + c)) * 4
      gray[r * regionW + c] = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255
    }
  }
  return gray
}

function sobelMagnitude(gray, w, h) {
  const mag = new Float32Array(w * h)
  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      const idx = r * w + c
      const gx = -gray[(r - 1) * w + (c - 1)] - 2 * gray[r * w + (c - 1)] - gray[(r + 1) * w + (c - 1)]
        + gray[(r - 1) * w + (c + 1)] + 2 * gray[r * w + (c + 1)] + gray[(r + 1) * w + (c + 1)]
      const gy = -gray[(r - 1) * w + (c - 1)] - 2 * gray[(r - 1) * w + c] - gray[(r - 1) * w + (c + 1)]
        + gray[(r + 1) * w + (c - 1)] + 2 * gray[(r + 1) * w + c] + gray[(r + 1) * w + (c + 1)]
      mag[idx] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return mag
}

function meanAndVariance(arr) {
  let sum = 0
  for (let i = 0; i < arr.length; i++) sum += arr[i]
  const mean = sum / arr.length
  let variance = 0
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean
    variance += d * d
  }
  variance /= arr.length
  return { mean, variance }
}

function ncc(a, b) {
  if (a.length !== b.length) return 0
  const statsA = meanAndVariance(a)
  const statsB = meanAndVariance(b)
  const den = Math.sqrt(statsA.variance * statsB.variance) * a.length
  if (den < EPSILON) return 0
  let num = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - statsA.mean) * (b[i] - statsB.mean)
  }
  return num / den
}

function scoreCandidate(imageData, alphaMap, templateGrad, x, y, size, imgW) {
  const gray = toGrayscale(imageData, x, y, size, size, imgW)
  const grad = sobelMagnitude(gray, size, size)
  const spatial = ncc(gray, alphaMap)
  const gradient = ncc(grad, templateGrad)
  return spatial * 0.5 + gradient * 0.3
}

function detectWatermarkPositionNCC(canvas) {
  const ctx = canvas.getContext('2d')
  const imgW = canvas.width
  const imgH = canvas.height
  const imageData = ctx.getImageData(0, 0, imgW, imgH)

  const sizes = [48]
  if (imgW >= 1024 || imgH >= 1024) sizes.push(96)

  let bestScore = -1
  let bestPos = null
  let bestSize = 48

  for (const size of sizes) {
    const alphaMap = getAlphaMap(size)
    const templateGrad = sobelMagnitude(alphaMap, size, size)

    const marginX = Math.round(imgW * 0.03)
    const marginY = Math.round(imgH * 0.03)
    const searchRight = imgW - size
    const searchBottom = imgH - size

    // Gemini watermark is in bottom-right region; search there
    const startX = Math.max(0, Math.round(imgW * 0.5))
    const startY = Math.max(0, Math.round(imgH * 0.5))
    const step = 4

    for (let y = startY; y <= searchBottom; y += step) {
      for (let x = startX; x <= searchRight; x += step) {
        const score = scoreCandidate(imageData, alphaMap, templateGrad, x, y, size, imgW)
        if (score > bestScore) {
          bestScore = score
          bestPos = { x, y }
          bestSize = size
        }
      }
    }

    // Refine around best position with step=1
    if (bestPos) {
      const refineRange = 8
      const rx0 = Math.max(0, bestPos.x - refineRange)
      const ry0 = Math.max(0, bestPos.y - refineRange)
      const rx1 = Math.min(searchRight, bestPos.x + refineRange)
      const ry1 = Math.min(searchBottom, bestPos.y + refineRange)
      for (let y = ry0; y <= ry1; y += 1) {
        for (let x = rx0; x <= rx1; x += 1) {
          const score = scoreCandidate(imageData, alphaMap, templateGrad, x, y, size, imgW)
          if (score > bestScore) {
            bestScore = score
            bestPos = { x, y }
            bestSize = size
          }
        }
      }
    }
  }

  // Fallback to fixed position if NCC finds nothing
  if (!bestPos || bestScore < 0.1) {
    return { ...calculateWatermarkPosition(imgW, imgH), score: bestScore, size: bestSize }
  }

  return {
    x: bestPos.x,
    y: bestPos.y,
    width: bestSize,
    height: bestSize,
    score: bestScore,
    size: bestSize
  }
}

function toCanvas(canvasOrImage) {
  if (canvasOrImage instanceof HTMLCanvasElement || canvasOrImage instanceof OffscreenCanvas) {
    return canvasOrImage
  }
  const canvas = new OffscreenCanvas(canvasOrImage.width || canvasOrImage.naturalWidth, canvasOrImage.height || canvasOrImage.naturalHeight)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(canvasOrImage, 0, 0)
  return canvas
}

function reverseAlphaBlend(pixels, alphaMap, wmW, wmH, alphaGain) {
  for (let row = 0; row < wmH; row++) {
    for (let col = 0; col < wmW; col++) {
      const localIdx = row * wmW + col
      const rawAlpha = alphaMap[localIdx] ?? 0
      const alphaMagnitude = Math.abs(rawAlpha)

      const signalAlpha = Math.max(0, alphaMagnitude - ALPHA_NOISE_FLOOR) * alphaGain
      if (signalAlpha < ALPHA_THRESHOLD) continue

      const alpha = Math.min(alphaMagnitude * alphaGain, MAX_ALPHA)
      const oneMinusAlpha = 1.0 - alpha
      if (oneMinusAlpha <= 0.001) continue

      const pixIdx = localIdx * 4
      for (let ch = 0; ch < 3; ch++) {
        const watermarked = pixels[pixIdx + ch]
        const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha
        pixels[pixIdx + ch] = Math.max(0, Math.min(255, Math.round(original)))
      }
    }
  }
}

export function calculateWatermarkPosition(imgWidth, imgHeight) {
  const isLarge = imgWidth >= 1024 || imgHeight >= 1024
  const size = isLarge ? 96 : 48
  const margin = Math.round(Math.min(imgWidth, imgHeight) * 0.05)
  // The Gemini watermark sits at the bottom-right corner.
  // The alpha map grid's bottom-right corner aligns with the image bottom-right
  // minus the margin. The diamond is centered in the grid.
  return {
    x: Math.max(0, imgWidth - size - margin),
    y: Math.max(0, imgHeight - size - margin),
    width: size,
    height: size
  }
}

export function detectWatermarkConfig(imgWidth, imgHeight) {
  const isLarge = imgWidth >= 1024 || imgHeight >= 1024
  const logoSize = isLarge ? 96 : 48
  return {
    logoSize,
    alphaGain: 1.0,
    position: calculateWatermarkPosition(imgWidth, imgHeight)
  }
}

export async function removeWatermarkFromImage(canvasOrImage, options = {}) {
  const canvas = toCanvas(canvasOrImage)
  const imgWidth = canvas.width
  const imgHeight = canvas.height

  // Use NCC template matching to find actual position
  const detected = detectWatermarkPositionNCC(canvas)
  const position = { x: detected.x, y: detected.y, width: detected.width, height: detected.height }
  const logoSize = detected.size || (imgWidth >= 1024 || imgHeight >= 1024 ? 96 : 48)
  const alphaGain = 1.0

  const alphaMap = getAlphaMap(logoSize)

  const ctx = canvas.getContext('2d')
  const imgData = ctx.getImageData(position.x, position.y, position.width, position.height)
  const pixels = imgData.data

  reverseAlphaBlend(pixels, alphaMap, position.width, position.height, alphaGain)

  ctx.putImageData(imgData, position.x, position.y)

  return {
    canvas,
    meta: {
      selectedCandidate: {
        position,
        config: { alphaGain, logoSize },
        score: detected.score
      }
    }
  }
}

export async function createWatermarkEngine() {
  return {
    async removeWatermarkFromImage(canvasOrImage) {
      return removeWatermarkFromImage(canvasOrImage)
    },

    async getAlphaMap(logoSize) {
      return getAlphaMap(logoSize)
    }
  }
}
