// schemas/linkCardType.ts
import { defineField, defineType } from 'sanity';

export const linkCardType = defineType({
  name: 'linkCard',
  title: 'Apps',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'App Name',
      type: 'string',
      description: 'The name of the app (for CMS organization only)',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'hook',
      title: 'Hook',
      type: 'string',
      description: 'The text that will appear on hover',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          description: 'Important for SEO and accessibility.',
        },
      ],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      description: 'The link that opens when the card is clicked',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Time-Saving Tools', value: 'Time-Saving Tools' },
          { title: 'Design & Creativity', value: 'Design & Creativity' },
          { title: 'Developer Tools', value: 'Developer Tools' },
          { title: 'AI & Machine Learning', value: 'AI & Machine Learning' },
          { title: 'Marketing & Sales', value: 'Marketing & Sales' },
          { title: 'Finance & Crypto', value: 'Finance & Crypto' },
          { title: 'Health & Wellness', value: 'Health & Wellness' },
          { title: 'Learning & Education', value: 'Learning & Education' },
          { title: 'Remote Work & Collaboration', value: 'Remote Work & Collaboration' },
          { title: 'Consumer & Lifestyle', value: 'Consumer & Lifestyle' },
        ],
      },
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'image',
      subtitle: 'url'
    },
  },
});