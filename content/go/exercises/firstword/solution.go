package piscine

func FirstWord(s string) string {
	word := ""
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' || s[i] == '\n' {
			if word != "" {
				break
			}
			continue
		}
		word += s[i : i+1]
	}
	return word + "\n"
}
