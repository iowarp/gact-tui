package ui

// file_picker_mentions.go tracks composer @-file mentions and reconciles them with the composer text.

import (
	"sort"
	"strings"
)

type composerFileMention struct {
	Path string
	Mode string
}

func cloneComposerFileMentions(in []composerFileMention) []composerFileMention {
	if len(in) == 0 {
		return nil
	}
	out := make([]composerFileMention, len(in))
	copy(out, in)
	return out
}

func (c *inputComposerComponent) addFileMention(path, mode string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	if mode == "" {
		mode = "read"
	}
	for i := range c.fileMentions {
		if c.fileMentions[i].Path == path {
			c.fileMentions[i].Mode = mode
			return
		}
	}
	c.fileMentions = append(c.fileMentions, composerFileMention{Path: path, Mode: mode})
}

func sanitizeSelectedFileMentions(text string, mentions []composerFileMention) string {
	if text == "" || len(mentions) == 0 {
		return text
	}
	ordered := cloneComposerFileMentions(mentions)
	sort.SliceStable(ordered, func(i, j int) bool {
		return len(ordered[i].Path) > len(ordered[j].Path)
	})
	out := text
	for _, mention := range ordered {
		path := strings.TrimSpace(mention.Path)
		if path == "" {
			continue
		}
		out = strings.ReplaceAll(out, "@"+path, path)
	}
	return strings.TrimSpace(out)
}

func activeComposerFileMentions(text string, mentions []composerFileMention) []composerFileMention {
	if strings.TrimSpace(text) == "" || len(mentions) == 0 {
		return nil
	}
	out := make([]composerFileMention, 0, len(mentions))
	seen := map[string]bool{}
	for _, mention := range mentions {
		path := strings.TrimSpace(mention.Path)
		if path == "" || seen[path] || !strings.Contains(text, "@"+path) {
			continue
		}
		seen[path] = true
		out = append(out, mention)
	}
	return out
}
