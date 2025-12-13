// schemas/linkCardType.ts
import { defineField, defineType } from 'sanity';

export const linkCardType = defineType({
  name: 'linkCard',
  title: 'Blogs',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Blog Name',
      type: 'string',
      description: 'The name of the blog (for CMS organization only)',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'hook',
      title: 'Hook',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            { title: 'Normal', value: 'normal' },
          ],
          lists: [],
          marks: {
            decorators: [
              { title: 'Strong', value: 'strong' },
              { title: 'Emphasis', value: 'em' },
            ],
            annotations: [],
          },
        },
      ],
      description: 'The text that will appear on hover (supports bold and italic)',
      validation: (rule) => rule.required(),
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
  ],
  preview: {
    select: {
      title: 'title',
      media: 'image',
      subtitle: 'url'
    },
  },
});