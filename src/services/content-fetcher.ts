import { Readability } from '@mozilla/readability';
import type { LocalBookmark } from '../types';

export class ContentFetcher {
  private static async fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkdingReader/1.0)'
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  static async fetchBookmarkContent(bookmark: LocalBookmark): Promise<{ 
    content: string; 
    readability_content: string; 
  }> {
    try {
      // First try to get content from the URL
      const response = await this.fetchWithTimeout(bookmark.url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status}`);
      }

      const html = await response.text();
      
      // Create a DOM parser to process the content
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract readable content using Readability
      const reader = new Readability(doc, {
        debug: false,
        maxElemsToParse: 1000,
        nbTopCandidates: 5,
        charThreshold: 500,
        classesToPreserve: [],
        keepClasses: false,
        serializer: (el) => (el as Element).innerHTML,
        disableJSONLD: false,
        allowedVideoRegex: /https?:\/\/(www\.)?(youtube|vimeo)\.com/i
      });

      const article = reader.parse();
      
      return {
        content: html,
        readability_content: article?.content || html
      };
    } catch (error) {
      console.error('Failed to fetch bookmark content:', error);
      
      // Fallback: try to use the description or create minimal content
      const fallbackContent = `
        <div class="fallback-content">
          <h1>${bookmark.title}</h1>
          <p>${bookmark.description || 'Content could not be loaded for offline reading.'}</p>
          <p><a href="${bookmark.url}" target="_blank">Read online</a></p>
        </div>
      `;
      
      return {
        content: fallbackContent,
        readability_content: fallbackContent
      };
    }
  }
}