package handlers

import "github.com/microcosm-cc/bluemonday"

// descriptionPolicy allows only the HTML the admin rich-text editor can
// produce (bold/italic/lists/images), so stored product descriptions stay
// safe to render on the public verify page even if an admin pastes in
// markup from an untrusted source.
var descriptionPolicy = newDescriptionPolicy()

func newDescriptionPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowElements("p", "br", "strong", "em", "ul", "ol", "li")
	p.AllowAttrs("src", "alt").OnElements("img")
	p.AllowElements("img")
	p.RequireParseableURLs(true)
	p.AllowURLSchemes("http", "https")
	return p
}

func sanitizeDescriptionHTML(s string) string {
	return descriptionPolicy.Sanitize(s)
}
